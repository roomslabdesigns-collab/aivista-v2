// Website investigation: a small same-domain breadth-first crawler.
import { existsSync } from "node:fs";
import * as cheerio from "cheerio";

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  rendered?: boolean; // true when the page needed headless-browser rendering
}

const SKIP = /\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|xml|json)(\?|$)|\/(login|signin|signup|cart|checkout|account|wp-admin)\b/i;
// Pages that say the most about the product get crawled first.
const PRIORITY = /pricing|product|feature|solution|platform|about|compare|vs|alternative|customer|use-case|integration|why/i;

export function normalizeUrl(input: string): string {
  const withProto = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const u = new URL(withProto);
  u.hash = "";
  return u.toString();
}

export function domainOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

const USER_AGENT = "Mozilla/5.0 (compatible; AIVistaBot/0.1; +https://github.com/aivista)";

// ── JavaScript rendering fallback (Playwright, optional) ───────────────
// Single-page apps return an almost empty HTML shell to a plain fetch. For those pages we render
// them in headless Chromium. Playwright is an optional dependency: without it, crawling still works.
interface Renderer {
  render(url: string): Promise<{ html: string; finalUrl: string } | null>;
  close(): Promise<void>;
}

async function loadPlaywright() {
  if (process.env.CRAWL_JS_FALLBACK === "false") return null;
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

export async function jsRenderingAvailable(): Promise<boolean> {
  const pw = await loadPlaywright();
  if (!pw) return false;
  try {
    return existsSync(pw.chromium.executablePath());
  } catch {
    return false;
  }
}

async function createRenderer(): Promise<Renderer | null> {
  const pw = await loadPlaywright();
  if (!pw) return null;
  try {
    const browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    // Skip heavy assets; only the DOM matters.
    await context.route("**/*", (route) =>
      ["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue(),
    );
    return {
      async render(url) {
        const page = await context.newPage();
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 25_000 });
          return { html: await page.content(), finalUrl: page.url() };
        } catch {
          return null;
        } finally {
          await page.close();
        }
      },
      close: () => browser.close(),
    };
  } catch (err) {
    console.warn(`[crawl] JS rendering unavailable: ${(err as Error).message.split("\n")[0]}`);
    return null;
  }
}

const looksEmpty = (r: { page: CrawledPage; links: string[] } | null) => !r || r.page.text.length < 400 || r.links.length < 2;

export async function crawlSite(
  startUrl: string,
  maxPages: number,
  onPage: (page: CrawledPage, count: number) => void,
): Promise<CrawledPage[]> {
  const start = normalizeUrl(startUrl);
  const host = new URL(start).hostname.replace(/^www\./, "");
  const queue: string[] = [start];
  const seen = new Set<string>([start]);
  const pages: CrawledPage[] = [];
  let renderer: Renderer | null | undefined; // undefined = not tried yet

  const fetchWithFallback = async (url: string) => {
    const r = await fetchPage(url);
    if (!looksEmpty(r)) return r;
    if (renderer === undefined) renderer = await createRenderer();
    if (!renderer) return r;
    const rendered = await renderer.render(url);
    if (!rendered) return r;
    const parsed = parseHtml(rendered.html, rendered.finalUrl);
    return parsed.page.text.length > (r?.page.text.length ?? 0) ? { ...parsed, page: { ...parsed.page, rendered: true } } : r;
  };

  try {
    while (queue.length && pages.length < maxPages) {
      const batch = queue.splice(0, 4);
      // Rendering is heavier, so once the browser is in use, go one page at a time.
      const results = renderer ? await sequential(batch, fetchWithFallback) : await Promise.all(batch.map(fetchWithFallback));
      for (const r of results) {
        if (!r) continue;
        pages.push(r.page);
        onPage(r.page, pages.length);
        const links = r.links
          .filter((l) => {
            try {
              const u = new URL(l);
              return u.hostname.replace(/^www\./, "") === host && !SKIP.test(u.pathname) && !seen.has(l);
            } catch {
              return false;
            }
          })
          .sort((a, b) => Number(PRIORITY.test(b)) - Number(PRIORITY.test(a)));
        for (const l of links) {
          seen.add(l);
          queue.push(l);
        }
        queue.sort((a, b) => Number(PRIORITY.test(b)) - Number(PRIORITY.test(a)));
      }
    }
  } finally {
    await renderer?.close();
  }
  return pages;
}

async function sequential<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) out.push(await fn(item));
  return out;
}

async function fetchPage(url: string): Promise<{ page: CrawledPage; links: string[] } | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    return parseHtml(await res.text(), res.url);
  } catch {
    return null;
  }
}

function parseHtml(html: string, baseUrl: string): { page: CrawledPage; links: string[] } {
  const $ = cheerio.load(html);
  const links = $("a[href]")
    .map((_, el) => {
      try {
        const u = new URL($(el).attr("href")!, baseUrl);
        u.hash = "";
        u.search = "";
        return u.toString();
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean) as string[];

  $("script, style, noscript, svg, iframe, nav, footer").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 6000);
  return {
    page: {
      url: baseUrl,
      title: $("title").first().text().trim() || baseUrl,
      description: $('meta[name="description"]').attr("content")?.trim() ?? "",
      headings: $("h1, h2, h3").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get().filter(Boolean).slice(0, 25),
      text,
    },
    links: [...new Set(links)],
  };
}
