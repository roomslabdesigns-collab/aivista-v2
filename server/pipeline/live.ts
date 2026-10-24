// Live engine: real crawl, Gemini as the "brain", free LLM providers as the AI assistants under test.
import type {
  ContentGap, Finding, GeneratedQuery, Level, QueryIntent, Recommendation, SiteProfile,
} from "../../shared/types.js";
import { geminiJson, geminiReady } from "../providers/gemini.js";
import { askModel, discoverModels } from "../providers/registry.js";
import { crawlSite } from "./crawl.js";
import type { Diagnosis, Engine, RawResponse } from "./engine.js";

const INTENTS: QueryIntent[] = ["high intent", "comparison", "alternative", "informational"];
const LEVELS: Level[] = ["high", "medium", "low"];
const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};
const level = (v: unknown): Level => (LEVELS.includes(v as Level) ? (v as Level) : "medium");

export const liveEngine: Engine = {
  async investigate(ctx) {
    if (!geminiReady()) throw new Error("Live mode needs GEMINI_API_KEY in .env");
    const { input } = ctx;

    // ── 1. Website investigation ─────────────────────────────────────
    ctx.step("crawl", "running", "Fetching pages…");
    const maxPages = Number(process.env.CRAWL_MAX_PAGES) || 20;
    const pages = await crawlSite(input.websiteUrl, maxPages, (_p, n) => ctx.step("crawl", "running", `${n} pages crawled`));
    if (!pages.length) throw new Error(`Could not fetch ${input.websiteUrl} — check the URL or whether the site blocks bots`);
    const rendered = pages.filter((p) => p.rendered).length;
    ctx.step("crawl", "done", `${ctx.domain} · ${pages.length} pages crawled${rendered ? ` (${rendered} rendered with JS)` : ""}`);

    // ── 2. Product + audience understanding ──────────────────────────
    ctx.step("understand", "running");
    ctx.step("audience", "running");
    const corpus = pages
      .map((p) => `URL: ${p.url}\nTITLE: ${p.title}\nDESCRIPTION: ${p.description}\nHEADINGS: ${p.headings.join(" | ")}\nTEXT: ${p.text.slice(0, 1800)}`)
      .join("\n\n---\n\n")
      .slice(0, 60_000);
    const profile = await geminiJson<Omit<SiteProfile, "pagesCrawled" | "pages">>(
      `You are analyzing the website of "${input.companyName}" (${input.websiteUrl}).
Known context — industry: ${input.industry || "unknown"}, market: ${input.targetMarket || "unknown"}, audience: ${input.audience || "unknown"}.
From the crawled pages below, describe what the company sells and to whom.\n\n${corpus}`,
      `{"summary": string (2-3 sentences), "category": string (short product category, e.g. "CRM software"), "products": string[], "features": string[] (max 10), "audiences": string[] (customer segments), "pricing": string, "differentiators": string[] (max 6)}`,
    );
    const site: SiteProfile = {
      pagesCrawled: pages.length,
      pages: pages.map((p) => ({ url: p.url, title: p.title })),
      summary: profile.summary ?? "",
      category: profile.category || input.industry || "Software",
      products: profile.products ?? [],
      features: profile.features ?? [],
      audiences: profile.audiences ?? [],
      pricing: profile.pricing,
      differentiators: profile.differentiators ?? [],
    };
    ctx.step("understand", "done", site.category);
    ctx.step("audience", "done", site.audiences.slice(0, 2).join(" & ") || input.audience);

    // ── 3. Customer query generation ─────────────────────────────────
    ctx.step("queries", "running");
    const n = clamp(input.queryCount, 3, 40, 7);
    const gen = await geminiJson<{ queries: { text: string; intent: string; persona?: string }[] }>(
      `Generate exactly ${n} realistic questions that potential customers of a ${site.category} type into AI assistants (ChatGPT, Gemini, Perplexity) while researching a purchase.
Company being evaluated: ${input.companyName}. Its known competitors: ${input.competitors.join(", ") || "unknown"}.
Product summary: ${site.summary}
Audiences: ${site.audiences.join(", ") || input.audience}. Market: ${input.targetMarket}.
Rules:
- Most questions must NOT name ${input.companyName}; they are unbiased buyer questions (e.g. "best ${site.category} for startups").
- Include a mix of intents: "high intent" (best X for Y), "comparison" (A vs B, may name the company), "alternative" (alternatives to a competitor), "informational" (how to choose / what features matter).
- Keep each question under 15 words, phrased like a real person.`,
      `{"queries": [{"text": string, "intent": "high intent" | "comparison" | "alternative" | "informational", "persona": string}]}`,
    );
    const queries: GeneratedQuery[] = (gen.queries ?? []).slice(0, n).map((q, i) => ({
      id: `q${i + 1}`,
      text: q.text.replace(/^["']|["']$/g, ""),
      intent: INTENTS.includes(q.intent as QueryIntent) ? (q.intent as QueryIntent) : "high intent",
      persona: q.persona,
    }));
    if (!queries.length) throw new Error("Gemini returned no queries");
    ctx.step("queries", "done", `${queries.length} queries · ${new Set(queries.map((q) => q.intent)).size} intent classes`);

    // ── 4. AI search testing across every configured free LLM ────────
    ctx.step("testing", "running", "Discovering free models…");
    const models = await discoverModels(ctx.log);
    if (!models.length) throw new Error("No AI assistants configured — add GROQ_API_KEY or COHERE_API_KEY");
    const total = models.length * queries.length;
    let done = 0;
    const responses: RawResponse[] = await Promise.all(
      models.flatMap((m) =>
        queries.map(async (q, qi): Promise<RawResponse> => {
          const t0 = Date.now();
          const base = { id: `${m.id}|${q.id}`.replace(/[^\w|.-]/g, "_"), queryId: q.id, modelId: m.id, modelName: m.name, provider: m.provider };
          try {
            const res = await askModel(m, q.text);
            return { ...base, text: res.text, urls: res.urls, latencyMs: Date.now() - t0, ...(res.text ? {} : { error: "Empty response" }) };
          } catch (err) {
            return { ...base, text: "", urls: [], error: (err as Error).message.slice(0, 300), latencyMs: Date.now() - t0 };
          } finally {
            done++;
            if (done % 3 === 0 || done === total || qi === 0) ctx.step("testing", "running", `${done}/${total} responses`);
          }
        }),
      ),
    );
    const ok = responses.filter((r) => !r.error);
    if (!ok.length) throw new Error(`All ${total} model calls failed. First error: ${responses[0]?.error}`);
    ctx.step("testing", "done", `${models.length} assistants · ${ok.length} responses`);

    // Competitors the assistants recommend that the user didn't list.
    let discovered: string[] = [];
    try {
      const sample = ok.slice(0, 45).map((r) => r.text.slice(0, 700)).join("\n---\n");
      const res = await geminiJson<{ brands: string[] }>(
        `These are AI assistant answers to buyer questions about ${site.category}. List the competing product/company brand names they recommend, most frequent first. Exclude "${input.companyName}" and generic terms.\n\n${sample}`,
        `{"brands": string[] (max 8)}`,
      );
      // "Zoho CRM" is the same brand as "Zoho": compare names without generic product words.
      const core = (s: string) => s.toLowerCase().replace(/\b(crm|inc|software|app|ai|hq|platform|suite|cloud)\b/g, "").replace(/[^a-z0-9]/g, "");
      const known = [input.companyName, ...input.competitors].map(core).filter(Boolean);
      const isKnown = (b: string) => known.some((k) => core(b) === k || core(b).startsWith(k) || k.startsWith(core(b)));
      for (const b of res.brands ?? []) {
        if (b && core(b) && !isKnown(b)) {
          discovered.push(b);
          known.push(core(b));
        }
      }
      discovered = discovered.slice(0, 6);
    } catch (err) {
      ctx.log(`Competitor discovery skipped: ${(err as Error).message.slice(0, 120)}`);
    }

    return { site, queries, models, responses, discoveredCompetitors: discovered };
  },

  async diagnose(ctx, facts): Promise<Diagnosis> {
    const { input } = ctx;
    ctx.step("diagnosis", "running");
    const target = input.companyName;
    const losing = facts.responses
      .filter((r) => !r.error && !r.mentions.some((m) => m.brand === target) && r.mentions.length)
      .slice(0, 12)
      .map((r) => `Q(${r.queryId}): ${facts.queries.find((q) => q.id === r.queryId)?.text}\nA [${r.modelName}]: ${r.text.slice(0, 600)}`)
      .join("\n---\n");

    type DiagnosisJson = {
      goal: string;
      findings: { title: string; description: string; metric: string; severity: string; queryIds: string[] }[];
      contentGaps: { topic: string; description: string; competitorsCovering: string[]; priority: string }[];
      recommendations: {
        title: string; description: string; category: string; impact: string; confidence: number;
        estimatedLift: number; actions: string[]; queryIds: string[];
      }[];
    };
    const fallbackGoal = `Investigate why ${target} is underperforming in AI search recommendations.`;
    // The AI answers are already collected; if the diagnosis call fails, keep the run with the rule-based findings.
    const res = await geminiJson<DiagnosisJson>(
      `You are a Generative Engine Optimization (GEO) strategist. Diagnose why AI assistants recommend competitors instead of "${target}" and what to do so ${target} gets recommended first.

COMPANY: ${target} — ${facts.site.summary}
Features: ${facts.site.features.join("; ")}
Differentiators: ${facts.site.differentiators.join("; ")}
Pages on its site: ${facts.site.pages.map((p) => p.title).slice(0, 25).join(" | ")}

COMPETITOR STATS (mention %, recommended-first %, avg position):
${facts.competitors.map((c) => `${c.name}${c.isTarget ? " (TARGET)" : ""}: ${c.mentionRate}% / ${c.recommendationRate}% / ${c.avgPosition ?? "-"}`).join("\n")}

QUERY INTENT VISIBILITY: ${facts.intentStats.map((i) => `${i.intent}: ${i.mentionRate}%`).join(", ")}
TOP CITED SOURCES: ${facts.citationSources.slice(0, 12).map((s) => `${s.domain} (${s.type}, brand share: ${Object.entries(s.brandShare).map(([b, v]) => `${b} ${v}%`).join("/")})`).join("; ") || "none (most models answered without citations)"}
QUERIES: ${facts.queries.map((q) => `${q.id}="${q.text}"`).join("; ")}

ANSWERS WHERE ${target} WAS MISSING:
${losing || "(none)"}

Give 2-3 extra findings that explain the WHY (positioning, missing content, third-party presence), 3-6 content gaps, and 4-6 prioritized recommendations. estimatedLift = expected increase in AI mention rate in percentage points (realistic: 2-20). confidence = 0-100.`,
      `{"goal": string (one sentence investigation goal), "findings": [{"title": string, "description": string, "metric": string (short, e.g. "3/5" or "40%"), "severity": "high"|"medium"|"low", "queryIds": string[]}], "contentGaps": [{"topic": string, "description": string, "competitorsCovering": string[], "priority": "high"|"medium"|"low"}], "recommendations": [{"title": string, "description": string, "category": string (e.g. "Comparison content", "Third-party citations", "Product documentation", "Structured data"), "impact": "high"|"medium"|"low", "confidence": number, "estimatedLift": number, "actions": string[] (3-5 concrete steps), "queryIds": string[]}]}`,
    ).catch((err: Error) => {
      ctx.log(`AI diagnosis failed: ${err.message.slice(0, 160)}`);
      return null;
    });
    if (!res) {
      ctx.step("diagnosis", "error", "AI diagnosis unavailable — showing rule-based findings; re-run for recommendations");
      ctx.step("recommend", "skipped", "Needs the AI diagnosis");
      return { goal: fallbackGoal, findings: [], contentGaps: [], recommendations: [] };
    }
    const qids = new Set(facts.queries.map((q) => q.id));
    const findings: Finding[] = (res.findings ?? []).map((f, i) => ({
      id: `f-ai-${i + 1}`,
      title: f.title,
      description: f.description,
      metric: f.metric ?? "",
      severity: level(f.severity),
      evidenceQueryIds: (f.queryIds ?? []).filter((q) => qids.has(q)),
    }));
    const contentGaps: ContentGap[] = (res.contentGaps ?? []).map((g, i) => ({
      id: `g${i + 1}`, topic: g.topic, description: g.description, competitorsCovering: g.competitorsCovering ?? [], priority: level(g.priority),
    }));
    ctx.step("diagnosis", "done", `${facts.findings.length + findings.length} findings · ${contentGaps.length} content gaps`);

    ctx.step("recommend", "running");
    const order = { high: 0, medium: 1, low: 2 };
    const recommendations: Recommendation[] = (res.recommendations ?? [])
      .map((r, i) => ({
        id: `r${i + 1}`,
        title: r.title,
        description: r.description,
        category: r.category || "GEO",
        impact: level(r.impact),
        confidence: clamp(r.confidence, 0, 100, 60),
        estimatedLift: clamp(r.estimatedLift, 0, 40, 5),
        actions: r.actions ?? [],
        targetQueryIds: (r.queryIds ?? []).filter((q) => qids.has(q)),
      }))
      .sort((a, b) => order[a.impact] - order[b.impact] || b.estimatedLift * b.confidence - a.estimatedLift * a.confidence);
    ctx.step("recommend", "done", `${recommendations.length} recommendations`);

    return { goal: res.goal || fallbackGoal, findings, contentGaps, recommendations };
  },
};
