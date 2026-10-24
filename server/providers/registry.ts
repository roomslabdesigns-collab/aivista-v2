// AI search testing targets: free LLMs, one per provider, so each "AI assistant" in the panel is a
// different model family (default panel: Groq, Mistral, Cohere). Gemini is the "brain" (query generation
// + analysis) and is only added as a tester when GEMINI_GROUNDED_TESTING=true.
import type { ModelInfo } from "../../shared/types.js";
import { HttpError, createLimiter, fetchJson, withRetry } from "./limiter.js";
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
  /** Provider-specific request fields for a given model. */
  extraBody?: (model: string) => Record<string, unknown>;
}

/** Number of AI assistants each query is tested against. */
export const TEST_MODEL_COUNT = Number(process.env.TEST_MODEL_COUNT) || 3;

async function listModels(url: string, key?: string): Promise<{ id: string; [k: string]: any }[]> {
  const data = await fetchJson(url, { headers: key ? { authorization: `Bearer ${key}` } : {} }, 20_000);
  return data?.data ?? [];
}

const NON_CHAT = /whisper|guard|safety|tts|playai|orpheus|embed|rerank|moderation|vision|-vl|clip|parse|reward|audio|ocr|compound|allam/i;

/** Orders model ids so well-known vendors come before niche ones (used when preferred models disappear). */
function byVendor(ids: string[], vendors: string[]) {
  const rank = (id: string) => {
    const i = vendors.indexOf(id.split("/")[0]);
    return i === -1 ? vendors.length : i;
  };
  return ids.sort((a, b) => rank(a) - rank(b));
}

// Order matters: the first TEST_MODEL_COUNT configured providers become testers 1, 2, 3…
// Default panel: Groq, Mistral, Cohere. The providers after them are optional extras.
export const PROVIDERS: ProviderDef[] = [
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    // Groq dropped its Llama models in 2026; GPT-OSS is OpenAI's open model, Qwen the backup.
    preferred: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    concurrency: 2,
    minIntervalMs: 2100, // free: 30 requests / minute
    // GPT-OSS is a reasoning model: keep thinking short so the token budget goes to the answer.
    extraBody: (model) => (model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
    available: async (key) =>
      (await listModels("https://api.groq.com/openai/v1/models", key)).filter((m) => m.active !== false && !NON_CHAT.test(m.id)).map((m) => m.id),
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    preferred: ["mistral-small-latest", "mistral-medium-latest", "open-mistral-nemo"],
    concurrency: 1,
    minIntervalMs: 1300, // free: ~1 request / second
    available: async (key) => (await listModels("https://api.mistral.ai/v1/models", key)).map((m) => m.id),
  },
  {
    id: "cohere",
    name: "Cohere",
    // Cohere's OpenAI-compatible endpoint, so it shares the chat/completions code path.
    baseUrl: "https://api.cohere.ai/compatibility/v1",
    keyEnv: "COHERE_API_KEY",
    modelEnv: "COHERE_MODEL",
    preferred: ["command-a-03-2025", "command-r-plus-08-2024", "command-r-08-2024"],
    concurrency: 2, // trial answers are slow, so overlap two of them
    minIntervalMs: 3500, // trial key: 20 requests / minute
    available: async (key) => {
      const data = await fetchJson("https://api.cohere.com/v1/models?endpoint=chat&page_size=100", { headers: { authorization: `Bearer ${key}` } }, 20_000);
      return (data?.models ?? []).map((m: { name: string }) => m.name).filter((id: string) => /^command/.test(id) && !NON_CHAT.test(id));
    },
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    modelEnv: "CEREBRAS_MODEL",
    preferred: ["qwen-3-235b-a22b-instruct-2507", "qwen-3-32b", "zai-glm-4.7", "gpt-oss-120b"],
    concurrency: 1,
    minIntervalMs: 6500, // free: ~10 requests / minute
    available: async (key) => (await listModels("https://api.cerebras.ai/v1/models", key)).map((m) => m.id),
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    modelEnv: "NVIDIA_MODEL",
    // Kimi / DeepSeek: model families none of the other testers cover.
    preferred: ["moonshotai/kimi-k2.6", "moonshotai/kimi-k2-instruct", "deepseek-ai/deepseek-v3.1"],
    concurrency: 2,
    minIntervalMs: 1600, // free: ~40 requests / minute
    available: async (key) =>
      byVendor(
        (await listModels("https://integrate.api.nvidia.com/v1/models", key)).map((m) => m.id).filter((id) => !NON_CHAT.test(id)),
        ["moonshotai", "deepseek-ai", "z-ai", "qwen", "meta", "mistralai", "nvidia"],
      ),
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
  const pools: { p: ProviderDef; key: string; ids: string[]; next: number }[] = [];
  for (const p of PROVIDERS) {
    const key = process.env[p.keyEnv];
    if (key) pools.push({ p, key, ids: await candidatesFor(p, key), next: 0 });
  }
  // Round-robin: one working model per provider, then second models while slots remain.
  while (models.length < TEST_MODEL_COUNT && pools.some((x) => x.next < x.ids.length)) {
    for (const pool of pools) {
      if (models.length >= TEST_MODEL_COUNT) break;
      const id = await nextWorkingModel(pool, log);
      if (id) models.push({ id: `${pool.p.id}:${id}`, name: prettyName(id), provider: pool.p.name, grounded: false });
    }
  }
  log(`Testing ${models.length} assistants: ${models.map((m) => `${m.name} (${m.provider})`).join(", ")}`);
  return models;
}

// Catalogs list models an account can't always call (e.g. NVIDIA returns 404 "Function not found").
// A 1-token request before each run confirms the model answers; results are cached for 6 hours.
const MAX_PROBES_PER_PICK = 5;
const probeCache = new Map<string, { ok: boolean; at: number }>();

async function nextWorkingModel(pool: { p: ProviderDef; key: string; ids: string[]; next: number }, log: (msg: string) => void) {
  for (let tries = 0; tries < MAX_PROBES_PER_PICK && pool.next < pool.ids.length; tries++) {
    const id = pool.ids[pool.next++];
    if (await modelAnswers(pool.p, pool.key, id)) return id;
    log(`${pool.p.name}: ${id} is not available for this account, trying the next model`);
  }
  pool.next = pool.ids.length; // give up on this provider for the rest of the panel
  return null;
}

async function modelAnswers(p: ProviderDef, key: string, id: string): Promise<boolean> {
  const cacheKey = `${p.id}:${id}`;
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.ok;
  let ok: boolean;
  try {
    await limiters.get(p.id)!(() =>
      fetchJson(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...p.extraHeaders },
        body: JSON.stringify({ model: id, messages: [{ role: "user", content: "Hi" }], max_tokens: 1 }),
      }, 30_000),
    );
    ok = true;
  } catch (err) {
    // Rate-limited or temporarily down still means the model exists; anything else (404, 400, 403) means skip it.
    ok = err instanceof HttpError && (err.status === 429 || err.status >= 500);
  }
  probeCache.set(cacheKey, { ok, at: Date.now() });
  return ok;
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
          max_tokens: 900, // about the length of a typical AI-assistant answer
          temperature: 0.3,
          ...p.extraBody?.(modelId),
        }),
      }, 150_000), // free tiers (Cohere trial especially) can take over a minute per answer
    ),
  );
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  // Strip reasoning blocks some open models emit.
  return { text: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), urls: [] };
}
