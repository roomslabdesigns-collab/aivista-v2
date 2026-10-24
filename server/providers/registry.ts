// AI search testing targets: free LLM providers behind OpenAI-compatible APIs,
// plus Gemini grounded in Google Search (the only free option that cites live web sources).
import type { ModelInfo } from "../../shared/types.js";
import { createLimiter, fetchJson, withRetry } from "./limiter.js";
import { geminiGroundedAnswer, geminiModelName, geminiReady } from "./gemini.js";

interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  keyEnv: string;
  /** Returns model ids to test; may call the provider's /models endpoint. */
  models: (key: string) => Promise<string[]>;
  concurrency: number;
  minIntervalMs: number;
  extraHeaders?: Record<string, string>;
}

const maxEnv = (name: string, fallback: number) => Number(process.env[name]) || fallback;

async function listModels(url: string, key?: string): Promise<{ id: string; [k: string]: any }[]> {
  const data = await fetchJson(url, { headers: key ? { authorization: `Bearer ${key}` } : {} }, 20_000);
  return data?.data ?? [];
}

const NON_CHAT = /whisper|guard|tts|playai|embed|moderation|vision-only|audio|ocr|compound|allam|prompt-guard/i;

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    concurrency: 2,
    minIntervalMs: 3200, // free models: ~20 requests / minute
    extraHeaders: { "HTTP-Referer": "http://localhost:5173", "X-Title": "AIVista" },
    models: async () => {
      const all = await listModels("https://openrouter.ai/api/v1/models");
      const free = all.filter((m) => m.id.endsWith(":free") && !NON_CHAT.test(m.id));
      // One model per vendor first, so the panel is diverse rather than five Llama variants.
      const seen = new Set<string>();
      const diverse = free.filter((m) => {
        const vendor = m.id.split("/")[0];
        if (seen.has(vendor)) return false;
        seen.add(vendor);
        return true;
      });
      const rest = free.filter((m) => !diverse.includes(m));
      return [...diverse, ...rest].slice(0, maxEnv("OPENROUTER_MAX_MODELS", 10)).map((m) => m.id);
    },
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    concurrency: 2,
    minIntervalMs: 2100,
    models: async (key) =>
      (await listModels("https://api.groq.com/openai/v1/models", key))
        .filter((m) => m.active !== false && !NON_CHAT.test(m.id))
        .slice(0, 6)
        .map((m) => m.id),
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    concurrency: 1,
    minIntervalMs: 2100,
    models: async (key) =>
      (await listModels("https://api.cerebras.ai/v1/models", key)).slice(0, 4).map((m) => m.id),
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    concurrency: 1,
    minIntervalMs: 1300,
    models: async () => ["mistral-small-latest", "open-mistral-nemo", "ministral-8b-latest"],
  },
  {
    id: "github",
    name: "GitHub Models",
    baseUrl: "https://models.github.ai/inference",
    keyEnv: "GITHUB_MODELS_TOKEN",
    concurrency: 1,
    minIntervalMs: 4500,
    models: async () => ["openai/gpt-4.1-mini", "openai/gpt-4o-mini", "microsoft/Phi-4", "meta/Llama-4-Scout-17B-16E-Instruct"],
  },
];

const limiters = new Map(PROVIDERS.map((p) => [p.id, createLimiter(p.concurrency, p.minIntervalMs)]));

export const providerStatus = () => [
  { id: "gemini", name: "Google Gemini", configured: geminiReady() },
  ...PROVIDERS.map((p) => ({ id: p.id, name: p.name, configured: !!process.env[p.keyEnv] })),
];

const prettyName = (id: string) =>
  id
    .replace(/:free$/, "")
    .split("/")
    .pop()!
    .replace(/[-_]/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase());

/** Builds the panel of "AI assistants" to test, from every configured provider. */
export async function discoverModels(log: (msg: string) => void): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  if (geminiReady() && process.env.GEMINI_GROUNDED_TESTING !== "false") {
    models.push({ id: `gemini-grounded:${geminiModelName()}`, name: "Gemini + Google Search", provider: "Google Gemini", grounded: true });
  }
  for (const p of PROVIDERS) {
    const key = process.env[p.keyEnv];
    if (!key) continue;
    try {
      const ids = await p.models(key);
      for (const id of ids) models.push({ id: `${p.id}:${id}`, name: prettyName(id), provider: p.name, grounded: false });
      log(`${p.name}: ${ids.length} models`);
    } catch (err) {
      log(`${p.name}: model discovery failed (${(err as Error).message.slice(0, 120)})`);
    }
  }
  return models;
}

const SYSTEM_PROMPT =
  "You are an AI search assistant. Answer the user's question helpfully and concretely, the way you would for someone researching a purchase. " +
  "Name specific products, vendors or brands where relevant, and explain why. If you rely on particular sources, list their URLs at the end.";

export async function askModel(model: ModelInfo, query: string): Promise<{ text: string; urls: string[] }> {
  const [providerId, ...rest] = model.id.split(":");
  const modelId = rest.join(":");

  if (providerId === "gemini-grounded") {
    const res = await geminiGroundedAnswer(query);
    return { text: res.text, urls: res.urls.map((u) => u.title ? `${u.url}#title=${encodeURIComponent(u.title)}` : u.url) };
  }

  const p = PROVIDERS.find((x) => x.id === providerId);
  if (!p) throw new Error(`Unknown provider ${providerId}`);
  const key = process.env[p.keyEnv]!;
  const data = await limiters.get(p.id)!(() =>
    withRetry(() =>
      fetchJson(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...p.extraHeaders },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query },
          ],
          max_tokens: 800,
          temperature: 0.3,
        }),
      }),
    ),
  );
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  // Strip reasoning blocks some open models emit.
  return { text: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), urls: [] };
}
