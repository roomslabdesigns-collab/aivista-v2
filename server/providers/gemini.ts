import { createLimiter, fetchJson, withRetry } from "./limiter.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Gemini's free tier allows a handful of requests per minute; keep well inside it.
const limit = createLimiter(1, 4500);

const apiKey = () => process.env.GEMINI_API_KEY ?? "";
const model = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

export const geminiReady = () => apiKey().length > 0;
export const geminiModelName = () => model();

async function generate(body: object) {
  return limit(() =>
    withRetry(() =>
      fetchJson(`${BASE}/${model()}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify(body),
      }, 120_000),
    ),
  );
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
