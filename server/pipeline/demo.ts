// Demo engine: simulates the full pipeline with realistic, deterministic data and no API calls.
// It writes plain-text AI answers, so the real mention/citation analysis runs on them unchanged.
import type {
  CompanyInput, ContentGap, Finding, GeneratedQuery, ModelInfo, QueryIntent, Recommendation, SiteProfile,
} from "../../shared/types.js";
import type { Diagnosis, Engine, RawResponse } from "./engine.js";
import type { HistoryPoint } from "./impact.js";

export const RELAY_SAMPLE: CompanyInput = {
  websiteUrl: "https://relaycrm.io",
  companyName: "Relay CRM",
  industry: "SaaS / CRM",
  targetMarket: "North America & Europe",
  audience: "Mid-market RevOps & Sales Directors",
  competitors: ["HubSpot", "Salesforce", "Pipedrive", "Zoho"],
  queryCount: 24,
};

const DEMO_MODELS: [string, string, boolean][] = [
  ["Gemini + Google Search", "Google Gemini", true],
  ["Llama 3.3 70B", "OpenRouter", false],
  ["DeepSeek V3", "OpenRouter", false],
  ["Qwen3 235B", "OpenRouter", false],
  ["Mistral Small 3.2", "OpenRouter", false],
  ["Gemma 3 27B", "OpenRouter", false],
  ["GPT OSS 120B", "OpenRouter", false],
  ["Kimi K2", "OpenRouter", false],
  ["GLM 4.5 Air", "OpenRouter", false],
  ["Nemotron Ultra 253B", "OpenRouter", false],
  ["Llama 3.1 8B Instant", "Groq", false],
  ["Llama 4 Scout", "Groq", false],
  ["Qwen3 32B", "Groq", false],
  ["GPT OSS 20B", "Groq", false],
  ["Llama 3.3 70B", "Cerebras", false],
  ["Qwen3 Coder 480B", "Cerebras", false],
  ["Mistral Nemo", "Mistral", false],
  ["Ministral 8B", "Mistral", false],
  ["GPT-4.1 mini", "GitHub Models", false],
  ["Phi-4", "GitHub Models", false],
];

// Deterministic PRNG so the same company always produces the same demo story.
function rng(seedText: string) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const categoryOf = (input: CompanyInput) => {
  const raw = (input.industry.split("/").pop() ?? "").trim() || "software";
  return /software|platform|tool|app\b|service/i.test(raw) ? raw : `${raw} software`;
};

const audienceOf = (input: CompanyInput) => {
  const a = input.audience.split(/&|,/)[0].trim();
  return a ? a.replace(/^mid-market /i, "mid-market ").toLowerCase() : "growing teams";
};

function buildQueries(input: CompanyInput): GeneratedQuery[] {
  const cat = categoryOf(input);
  const aud = audienceOf(input);
  const t = input.companyName;
  const [c0 = "the market leader", c1 = c0, c2 = c1] = input.competitors;
  const pool: Record<QueryIntent, string[]> = {
    "high intent": [
      `best ${cat} for startups`, `best ${cat} for ${aud}`, `top ${cat} tools for small sales teams`,
      `most affordable ${cat} with good support`, `which ${cat} is easiest to set up`, `best ${cat} for B2B companies`,
      `${cat} with the best reporting and forecasting`, `best ${cat} for remote teams`,
    ],
    comparison: [
      `${t} vs ${c0} for mid-market`, `${c0} vs ${c1} vs ${t}`, `${c1} or ${t} for a growing sales team`,
      `${t} vs ${c2} pricing`, `is ${t} better than ${c0}`,
    ],
    alternative: [
      `${c0} alternatives`, `cheaper alternatives to ${c1}`, `${c2} alternatives for ${aud}`,
      `${c0} alternatives for startups`, `what to use instead of ${c1}`,
    ],
    informational: [
      `how to choose a ${cat}`, `what features matter most in a ${cat}`, `${cat} with the best integrations`,
      `how much does a ${cat} cost`, `${cat} implementation checklist`, `which ${cat} has the best AI features`,
    ],
  };
  const order: QueryIntent[] = ["high intent", "comparison", "alternative", "high intent", "informational", "alternative"];
  const used: Record<string, number> = {};
  const out: GeneratedQuery[] = [];
  for (let i = 0; out.length < input.queryCount && i < 200; i++) {
    const intent = order[i % order.length];
    const idx = used[intent] ?? 0;
    if (idx >= pool[intent].length) continue;
    used[intent] = idx + 1;
    out.push({ id: `q${out.length + 1}`, text: pool[intent][idx], intent, persona: input.audience || undefined });
  }
  return out;
}

const REASONS = [
  "a generous free tier and an easy onboarding flow",
  "the deepest ecosystem of integrations and a large app marketplace",
  "strong pipeline visualization that sales reps actually enjoy using",
  "enterprise-grade customization and reporting",
  "solid value for money with an all-in-one suite",
  "fast setup and clean automation for mid-market teams",
  "native forecasting and revenue analytics",
  "excellent documentation and a big community",
];

const SOURCES: [string, string][] = [
  ["g2.com", "https://www.g2.com/categories/crm"],
  ["capterra.com", "https://www.capterra.com/customer-relationship-management-software/"],
  ["trustradius.com", "https://www.trustradius.com/crm"],
  ["reddit.com", "https://www.reddit.com/r/sales/comments/best_crm"],
  ["zapier.com", "https://zapier.com/blog/best-crm-app/"],
  ["techradar.com", "https://www.techradar.com/best/best-crm-software"],
  ["pcmag.com", "https://www.pcmag.com/picks/the-best-crm-software"],
  ["forbes.com", "https://www.forbes.com/advisor/business/software/best-crm-software/"],
  ["youtube.com", "https://www.youtube.com/watch?v=crm-comparison"],
  ["softwareadvice.com", "https://www.softwareadvice.com/crm/"],
];

function writeAnswer(query: GeneratedQuery, ranked: { name: string; reason: string }[], cite: [string, string][]) {
  const intro =
    query.intent === "informational"
      ? `Good question. The right choice depends on team size, budget and the tools you already use. Options people commonly shortlist:`
      : `Here are the strongest options for "${query.text}":`;
  const lines = ranked.map((b, i) => `${i + 1}. **${b.name}** — ${b.reason}.`);
  const outro = ranked.length
    ? `\n\nIf you want a quick recommendation, start with a trial of ${ranked[0].name} and compare it against one alternative on your must-have workflows.`
    : `\n\nI'd suggest listing your must-have features and trialing two or three tools.`;
  const sources = cite.length ? `\n\nSources:\n${cite.map(([, url]) => `- ${url}`).join("\n")}` : "";
  return `${intro}\n\n${lines.join("\n")}${outro}${sources}`;
}

export const demoEngine: Engine = {
  async investigate(ctx) {
    const { input } = ctx;
    const r = rng(input.companyName + input.competitors.join());
    const cat = categoryOf(input);
    const pace = (ms: number) => sleep(ms * (0.7 + r() * 0.6));

    ctx.step("crawl", "running", "Fetching pages…");
    const pageNames = ["Home", "Pricing", "Product", "Features", "Integrations", "Customers", "About", "Security", "Blog", "Docs"];
    for (let i = 1; i <= 6; i++) {
      await pace(180);
      ctx.step("crawl", "running", `${i * 23} pages crawled`);
    }
    const pagesCrawled = 142;
    ctx.step("crawl", "done", `${ctx.domain} · ${pagesCrawled} pages crawled`);

    ctx.step("understand", "running");
    await pace(700);
    ctx.step("understand", "done", `${cat} · ${input.audience.toLowerCase().includes("mid-market") ? "mid-market" : "SMB & mid-market"}`);
    ctx.step("audience", "running");
    await pace(600);
    ctx.step("audience", "done", input.audience || "Sales leaders & RevOps");

    const site: SiteProfile = {
      pagesCrawled,
      pages: pageNames.map((p) => ({ url: `https://${ctx.domain}/${p === "Home" ? "" : p.toLowerCase()}`, title: `${p} · ${input.companyName}` })),
      summary: `${input.companyName} is a ${cat} built for ${input.audience || "growing teams"}, focused on pipeline management, automation and revenue forecasting for teams in ${input.targetMarket || "global markets"}.`,
      category: cat,
      products: [`${input.companyName} Core`, `${input.companyName} Forecasting`, `${input.companyName} Automations`],
      features: ["Visual pipelines", "Workflow automation", "Revenue forecasting", "Email & calendar sync", "Custom dashboards", "Native integrations", "Role-based permissions", "AI deal insights"],
      audiences: (input.audience || "Sales directors, RevOps").split(/&|,/).map((s) => s.trim()).filter(Boolean),
      pricing: "From $29 / user / month, 14-day free trial",
      differentiators: ["Fast 1-day setup", "Forecasting included in every plan", "Transparent per-seat pricing"],
    };

    ctx.step("queries", "running");
    await pace(900);
    const queries = buildQueries(input);
    ctx.step("queries", "done", `${queries.length} queries · ${new Set(queries.map((q) => q.intent)).size} intent classes`);

    ctx.step("testing", "running");
    const models: ModelInfo[] = DEMO_MODELS.map(([name, provider, grounded]) => ({
      id: `${provider.toLowerCase().replace(/\s+/g, "")}:${name.toLowerCase().replace(/\s+/g, "-")}`,
      name, provider, grounded,
    }));

    // Brand strength by query intent: the target is weak exactly where buyers compare.
    const target = input.companyName;
    const strength = (brand: string, idx: number, q: GeneratedQuery) => {
      if (q.text.toLowerCase().includes(brand.toLowerCase())) return 0.97;
      if (brand === target) return { "high intent": 0.42, comparison: 0.3, alternative: 0.22, informational: 0.62 }[q.intent];
      return [0.86, 0.74, 0.6, 0.48, 0.4, 0.35][idx] ?? 0.3;
    };
    const discovered = /crm/i.test(cat) ? ["Close", "Freshsales"] : [];
    const brands = [target, ...input.competitors, ...discovered];

    const responses: RawResponse[] = [];
    const total = models.length * queries.length;
    for (const m of models) {
      for (const q of queries) {
        const picked = brands
          .map((b, i) => {
            const s = b === target ? strength(b, -1, q)! : strength(b, i - 1, q)!;
            const cites = m.grounded || r() < 0.3;
            // Answers that lean on third-party sources mention the target less often (the citation gap).
            const adj = b === target && cites ? s * 0.7 : s;
            return { name: b, score: r() < adj ? adj + r() * 0.5 : -1 };
          })
          .filter((b) => b.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((b) => ({ name: b.name, reason: REASONS[Math.floor(r() * REASONS.length)] }));
        const cite = m.grounded || r() < 0.3 ? [...SOURCES].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 3)) : [];
        const failed = r() < 0.015;
        responses.push({
          id: `${m.id}|${q.id}`,
          queryId: q.id,
          modelId: m.id,
          modelName: m.name,
          provider: m.provider,
          text: failed ? "" : writeAnswer(q, picked, cite),
          urls: [],
          latencyMs: Math.round(800 + r() * 4200),
          ...(failed ? { error: "429 Too Many Requests (free tier rate limit) — retried 3 times" } : {}),
        });
      }
      ctx.step("testing", "running", `${responses.length}/${total} responses`);
      await pace(140);
    }
    ctx.step("testing", "done", `${models.length} assistants · ${responses.filter((x) => !x.error).length} responses`);

    const historyFor = (cur: { aiVisibility: number; mentionRate: number; citationCoverage: number; recommendationRate: number }, compAvg: number): HistoryPoint[] => {
      const offsets = [14, 11, 12, 8, 5]; // visibility slid while competitors gained
      const now = new Date();
      return offsets.map((o, i) => ({
        date: new Date(now.getFullYear(), now.getMonth() - (5 - i), 1).toISOString(),
        metrics: {
          aiVisibility: Math.max(0, cur.aiVisibility - Math.round(o * 0.9)),
          mentionRate: Math.max(0, cur.mentionRate - o),
          citationCoverage: Math.max(0, cur.citationCoverage - Math.round(o * 0.8)),
          recommendationRate: Math.max(0, cur.recommendationRate - Math.round(o * 0.5)),
        },
        competitorAvg: Math.max(0, compAvg - Math.round(o * 0.4) - (i % 2)),
      }));
    };

    return { site, queries, models, responses, discoveredCompetitors: discovered, historyFor };
  },

  async diagnose(ctx, facts): Promise<Diagnosis> {
    const { input } = ctx;
    const t = input.companyName;
    const [c0 = "the leader", c1 = c0, c2 = c1] = input.competitors;
    const byIntent = (...intents: QueryIntent[]) => facts.queries.filter((q) => intents.includes(q.intent)).map((q) => q.id);

    ctx.step("diagnosis", "running");
    await sleep(900);
    const weakest = [...facts.intentStats].sort((a, b) => a.mentionRate - b.mentionRate)[0];
    const findings: Finding[] = [
      {
        id: "f-ai-1",
        title: "Positioning is unclear to AI models",
        description: `Assistants describe ${c0} and ${c1} with specific use cases ("best for startups", "best for enterprise"), but describe ${t} generically. Without a crisp "best for" claim repeated across the web, models rarely pick ${t} as the answer.`,
        metric: weakest ? `${weakest.mentionRate}%` : "—",
        severity: "high",
        evidenceQueryIds: byIntent("high intent").slice(0, 4),
      },
    ];
    const contentGaps: ContentGap[] = [
      { id: "g1", topic: `${c0} alternatives`, description: `No page targets "${c0} alternatives", the highest-volume switching query. ${c1} and ${c2} both rank with dedicated pages.`, competitorsCovering: [c1, c2], priority: "high" },
      { id: "g2", topic: `${t} vs ${c0}`, description: "No first-party comparison page, so assistants rely on third-party comparisons that omit you.", competitorsCovering: [c0, c2], priority: "high" },
      { id: "g3", topic: "Pricing transparency", description: "Pricing details are behind a demo form; models cite competitors' public pricing pages instead.", competitorsCovering: [c0, c1, c2], priority: "medium" },
      { id: "g4", topic: "Integration documentation", description: "Integration pages are thin, so models don't connect you to common workflows.", competitorsCovering: [c0, c1], priority: "medium" },
      { id: "g5", topic: "Customer proof for mid-market", description: "Few public case studies with metrics for the target segment.", competitorsCovering: [c0], priority: "low" },
    ];
    ctx.step("diagnosis", "done", `${facts.findings.length + findings.length} findings · ${contentGaps.length} content gaps`);

    ctx.step("recommend", "running");
    await sleep(800);
    const recommendations: Recommendation[] = [
      {
        id: "r1", title: `Create ${c0} Alternatives Page`, category: "Comparison content", impact: "high", confidence: 82, estimatedLift: 14,
        description: `Could improve visibility for ${byIntent("alternative").length + 8} high-value queries and increase AI referral traffic by roughly 25%.`,
        actions: [`Publish a "${c0} alternatives" page that honestly compares 5–7 tools including ${t}`, "Lead with a clear 'best for' statement and a comparison table", "Add FAQ schema answering the top switching questions", "Get it linked from 2–3 industry roundups"],
        targetQueryIds: byIntent("alternative"),
      },
      {
        id: "r2", title: "Earn Third-Party Citations", category: "Third-party citations", impact: "high", confidence: 69, estimatedLift: 12,
        description: "Competitors hold 3x more citations from industry publications and review sites.",
        actions: ["Run a review campaign on G2 and Capterra (target 50+ new reviews)", "Pitch inclusion in the top 5 'best CRM' roundups AI assistants cite", "Answer buyer questions authentically in relevant communities"],
        targetQueryIds: byIntent("high intent"),
      },
      {
        id: "r3", title: `Publish ${t} vs ${c1} comparison pages`, category: "Comparison content", impact: "high", confidence: 77, estimatedLift: 10,
        description: `Head-to-head queries are where buyers decide; today assistants answer them from ${c1}'s own content.`,
        actions: [`Create ${t} vs ${c0}, vs ${c1} and vs ${c2} pages with fair, specific feature tables`, "Include pricing, setup time and support comparisons", "Refresh them quarterly"],
        targetQueryIds: byIntent("comparison"),
      },
      {
        id: "r4", title: "Improve Product Documentation", category: "Product documentation", impact: "medium", confidence: 74, estimatedLift: 8,
        description: "Your key features are not well represented in the sources AI systems commonly cite.",
        actions: ["Publish public, crawlable docs for forecasting and automation", "Write integration guides for the top 10 tools buyers use", "Make pricing public and machine-readable"],
        targetQueryIds: byIntent("informational"),
      },
      {
        id: "r5", title: "Add structured data and FAQ schema", category: "Structured data", impact: "low", confidence: 64, estimatedLift: 4,
        description: "Structured product, pricing and FAQ markup helps assistants extract accurate facts about you.",
        actions: ["Add Product, Offer and FAQPage schema", "Keep an llms.txt summary of products and pricing", "Ensure key pages render without JavaScript"],
        targetQueryIds: byIntent("informational", "high intent").slice(0, 5),
      },
    ];
    ctx.step("recommend", "done", `${recommendations.length} recommendations`);

    return {
      goal: `Investigate why ${t} is underperforming in AI search recommendations — and why competitors are recommended instead.`,
      findings,
      contentGaps,
      recommendations,
    };
  },
};
