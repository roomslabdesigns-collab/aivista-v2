// AI search testing targets: five free LLMs, one per provider, so each "AI assistant" in the
// panel is a different model family. Gemini is the "brain" (query generation + analysis) and is
// only added as a tester when GEMINI_GROUNDED_TESTING=true (it's the one free option with live web citations).
import type { ModelInfo } from "../../shared/types.js";
import { createLimiter, fetchJson, withRetry } from "./limiter.js";
import { geminiGroundedAnswer, geminiModelName, geminiReady } from "./gemini.js";

interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  keyEnv: string;
  /** Env var that pins the exact model to test, e.g. GROQ_MODEL=llama-3.3-70b-versatile */
  modelEnv: string;
  /** Preferred models, best first. The first one the provider still offers is used. */
  preferred: string[];
  /** Model ids the provider currently offers (used when none of the preferred ones exist anymore). */
  available: (key: string) => Promise<string[]>;
  concurrency: number;
  minIntervalMs: number;
  extraHeaders?: Record<string, string>;
}

/** Number of AI assistants each query is tested against. */
export const TEST_MODEL_COUNT = Number(process.env.TEST_MODEL_COUNT) || 5;

async function listModels(url: string, key?: string): Promise<{ id: string; [k: string]: any }[]> {
  const data = await fetchJson(url, { headers: key ? { authorization: `Bearer ${key}` } : {} }, 20_000);
  return data?.data ?? [];
}

const NON_CHAT = /whisper|guard|safety|tts|playai|embed|moderation|vision-only|audio|ocr|compound|allam|prompt-guard/i;
const WELL_KNOWN_VENDORS = ["google", "meta-llama", "deepseek", "qwen", "mistralai", "openai", "nvidia", "microsoft", "cohere"];

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    // OpenRouter's free list changes often; Gemma adds a model family the other four providers don't cover.
    preferred: ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"],
    concurrency: 2,
    minIntervalMs: 3200, // free models: ~20 requests / minute
    extraHeaders: { "HTTP-Referer": "https://aivista.app", "X-Title": "AIVista" },
    available: async () => {
      const free = (await listModels("https://openrouter.ai/api/v1/models"))
        .map((m) => m.id)
        .filter((id) => id.endsWith(":free") && !NON_CHAT.test(id));
      // If the preferred models disappear, fall back to well-known vendors before niche ones.
      const rank = (id: string) => {
        const i = WELL_KNOWN_VENDORS.indexOf(id.split("/")[0]);
        return i === -1 ? WELL_KNOWN_VENDORS.length : i;
      };
      return free.sort((a, b) => rank(a) - rank(b));
    },
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    preferred: ["llama-3.3-70b-versatile", "meta-llama/llama-4-maverick-17b-128e-instruct", "llama-3.1-8b-instant"],
    concurrency: 2,
    minIntervalMs: 2100,
    available: async (key) =>
      (await listModels("https://api.groq.com/openai/v1/models", key)).filter((m) => m.active !== false && !NON_CHAT.test(m.id)).map((m) => m.id),
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    modelEnv: "CEREBRAS_MODEL",
    preferred: ["qwen-3-235b-a22b-instruct-2507", "qwen-3-32b", "gpt-oss-120b"],
    concurrency: 1,
    minIntervalMs: 2100,
    available: async (key) => (await listModels("https://api.cerebras.ai/v1/models", key)).map((m) => m.id),
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    preferred: ["mistral-small-latest", "open-mistral-nemo", "ministral-8b-latest"],
    concurrency: 1,
    minIntervalMs: 1300,
    available: async (key) => (await listModels("https://api.mistral.ai/v1/models", key)).map((m) => m.id),
  },
  {
    id: "github",
    name: "GitHub Models",
    baseUrl: "https://models.github.ai/inference",
    keyEnv: "GITHUB_MODELS_TOKEN",
    modelEnv: "GITHUB_MODEL",
    preferred: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini", "microsoft/Phi-4"],
    concurrency: 1,
    minIntervalMs: 4500,
    // GitHub's catalog endpoint differs from the inference API; trust the preferred list.
    available: async () => [],
  },
];

/** Pinned model first, then preferred models the provider still offers, then everything else it offers. */
async function candidatesFor(p: ProviderDef, key: string): Promise<string[]> {
  const pinned = process.env[p.modelEnv]?.trim();
  if (pinned) return [pinned];
  let offered: string[] = [];
  try {
    offered = await p.available(key);
  } catch {
    /* listing failed: fall back to the preferred list */
  }
  if (!offered.length) return p.preferred;
  const stillOffered = p.preferred.filter((m) => offered.includes(m));
  return [...stillOffered, ...offered.filter((m) => !stillOffered.includes(m))];
}

const limiters = new Map(PROVIDERS.map((p) => [p.id, createLimiter(p.concurrency, p.minIntervalMs)]));

export const providerStatus = () => [
  { id: "gemini", name: "Google Gemini", configured: geminiReady() },
  ...PROVIDERS.map((p) => ({ id: p.id, name: p.name, configured: !!process.env[p.keyEnv] })),
];

// "google/gemma-4-31b-it:free" → "Gemma 4 31B", "gpt-4.1-mini" → "GPT 4.1 Mini"
const prettyName = (id: string) =>
  id
    .replace(/:free$/, "")
    .split("/")
    .pop()!
    .replace(/-(it|instruct|latest|versatile|\d{4})(?=-|$)/gi, "")
    .replace(/[-_]/g, " ")
    .replace(/\b(\d+(?:\.\d+)?)b\b/gi, "$1B")
    .replace(/\b(gpt|oss)\b/gi, (w) => w.toUpperCase())
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .trim();

/**
 * Builds the panel of TEST_MODEL_COUNT "AI assistants": one model from each configured provider.
 * If fewer providers are configured than that, the remaining slots take a second model from them in turn.
 */
export async function discoverModels(log: (msg: string) => void): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  if (geminiReady() && process.env.GEMINI_GROUNDED_TESTING === "true") {
    models.push({ id: `gemini-grounded:${geminiModelName()}`, name: "Gemini + Google Search", provider: "Google Gemini", grounded: true });
  }
  const pools: { p: ProviderDef; ids: string[] }[] = [];
  for (const p of PROVIDERS) {
    const key = process.env[p.keyEnv];
    if (key) pools.push({ p, ids: await candidatesFor(p, key) });
  }
  for (let round = 0; models.length < TEST_MODEL_COUNT && pools.some((x) => x.ids.length > round); round++) {
    for (const { p, ids } of pools) {
      if (models.length >= TEST_MODEL_COUNT) break;
      const id = ids[round];
      if (id) models.push({ id: `${p.id}:${id}`, name: prettyName(id), provider: p.name, grounded: false });
    }
  }
  log(`Testing ${models.length} assistants: ${models.map((m) => `${m.name} (${m.provider})`).join(", ")}`);
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
