import { HttpError, createLimiter, fetchJson, withRetry } from "./limiter.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Gemini's free tier allows a handful of requests per minute; keep well inside it.
const limit = createLimiter(1, 4500);

const apiKey = () => process.env.GEMINI_API_KEY ?? "";
// Google retires older Gemini versions (2.5 Flash no longer answers); override with GEMINI_MODEL.
const model = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";
// Tried in order when the main model is overloaded (503), rate-limited (429) or retired (404).
const FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

export const geminiReady = () => apiKey().length > 0;
export const geminiModelName = () => model();

async function generate(body: object) {
  const models = [...new Set([model(), ...FALLBACK_MODELS])];
  let lastErr: unknown;
  for (const m of models) {
    try {
      return await limit(() =>
        withRetry(() =>
          fetchJson(`${BASE}/${m}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
            body: JSON.stringify(body),
          }, 120_000),
        ),
      );
    } catch (err) {
      lastErr = err;
      const tryNext = err instanceof HttpError && [404, 429, 500, 503].includes(err.status);
      if (!tryNext) throw err;
      console.warn(`[gemini] ${m} unavailable (${err.status}), trying the next model`);
    }
  }
  throw lastErr;
}

function textOf(data: any): string {
  return (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
}

/** Ask Gemini for strict JSON. `shape` is a human-readable description of the expected object. */
export async function geminiJson<T>(prompt: string, shape: string): Promise<T> {
  const data = await generate({
    contents: [{ role: "user", parts: [{ text: `${prompt}\n\nRespond ONLY with JSON matching this shape:\n${shape}` }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  const raw = textOf(data).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(raw) as T;
}

/** Answer a query like an AI search assistant, grounded in Google Search (returns real citations). */
export async function geminiGroundedAnswer(query: string): Promise<{ text: string; urls: { url: string; title?: string }[] }> {
  const data = await generate({
    contents: [{ role: "user", parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
  });
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const urls = chunks
    .map((c: any) => ({ url: c?.web?.uri as string, title: c?.web?.title as string | undefined }))
    .filter((c: { url?: string }) => c.url);
  return { text: textOf(data), urls };
}
