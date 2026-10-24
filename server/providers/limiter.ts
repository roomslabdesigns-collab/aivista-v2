// Tiny rate limiter: caps concurrency and spaces out request starts.
// Free LLM tiers enforce requests-per-minute limits, so every provider gets one.
export function createLimiter(concurrency: number, minIntervalMs: number) {
  let active = 0;
  let lastStart = 0;
  const waiting: (() => void)[] = [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function acquire() {
    if (active >= concurrency) await new Promise<void>((r) => waiting.push(r));
    active++;
    const wait = lastStart + minIntervalMs - Date.now();
    lastStart = Math.max(Date.now(), lastStart + minIntervalMs);
    if (wait > 0) await sleep(wait);
  }

  function release() {
    active--;
    waiting.shift()?.();
  }

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
  }
}

// Retries 429 / 5xx with exponential backoff.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof HttpError && (err.status === 429 || err.status >= 500);
      if (!retryable || i === attempts - 1) throw err;
      const delay = err.retryAfterMs ?? 2000 * 2 ** i;
      await new Promise((r) => setTimeout(r, Math.min(delay, 30_000)));
    }
  }
  throw lastErr;
}

export async function fetchJson(url: string, init: RequestInit, timeoutMs = 60_000): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new HttpError(
      res.status,
      `${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }
  return res.json();
}
