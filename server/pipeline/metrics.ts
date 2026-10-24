// Competitor + citation analysis. Pure functions shared by live and demo runs,
// so both modes compute every number the same way.
import type {
  BrandMention, Citation, CitationSource, CompetitorStat, Finding, GeneratedQuery, IntentStat,
  MetricSet, ModelInfo, ModelResponse, ModelStat, SourceType,
} from "../../shared/types.js";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function brandAliases(name: string, domain?: string): string[] {
  const aliases = new Set([name.trim()]);
  // "salesforce.com" style names also match "Salesforce"
  const bare = name.replace(/\.(com|io|ai|co|app|net|org)$/i, "").trim();
  if (bare.length >= 3) aliases.add(bare);
  if (domain) {
    const root = domain.replace(/^www\./, "").split(".")[0];
    if (root.length >= 4) aliases.add(root);
  }
  return [...aliases];
}

export interface BrandDef {
  name: string;
  aliases: string[];
}

export function detectMentions(text: string, brands: BrandDef[]): BrandMention[] {
  const found: { brand: string; index: number }[] = [];
  for (const b of brands) {
    let best = -1;
    for (const alias of b.aliases) {
      const m = new RegExp(`(^|[^\\w])${escapeRe(alias)}(?![\\w])`, "i").exec(text);
      if (m && (best === -1 || m.index < best)) best = m.index;
    }
    if (best >= 0) found.push({ brand: b.name, index: best });
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((f, i) => ({ brand: f.brand, position: i + 1, recommended: i === 0 }));
}

const SOURCE_RULES: [RegExp, SourceType][] = [
  [/g2\.com|capterra|trustradius|getapp|softwareadvice|trustpilot|gartner|producthunt|sourceforge|clutch\.co/i, "review directory"],
  [/reddit|quora|stackexchange|stackoverflow|news\.ycombinator|community\.|forum/i, "forum"],
  [/youtube|vimeo/i, "video"],
  [/techcrunch|forbes|businessinsider|theverge|wired|reuters|bloomberg|zdnet|cnet|venturebeat/i, "news"],
  [/zapier\.com\/blog|hubspot\.com\/blog|medium\.com|substack|blog\.|\/blog/i, "comparison blog"],
  [/pcmag|techradar|tomsguide|nerdwallet|investopedia|top10|best|review/i, "industry roundup"],
];

export function classifySource(domainOrUrl: string, vendorDomains: string[]): SourceType {
  const d = domainOrUrl.toLowerCase();
  if (vendorDomains.some((v) => v && d.includes(v))) return "vendor docs";
  for (const [re, type] of SOURCE_RULES) if (re.test(d)) return type;
  return "other";
}

const URL_RE = /https?:\/\/[^\s)\]>"'`]+/g;

export function extractCitations(text: string, extraUrls: string[], vendorDomains: string[]): Citation[] {
  const urls = [...extraUrls, ...(text.match(URL_RE) ?? [])];
  const out = new Map<string, Citation>();
  for (const raw of urls) {
    const [url, titlePart] = raw.split("#title=");
    let domain: string;
    try {
      // Grounding redirect URLs hide the real site; Gemini puts the domain in the title.
      const title = titlePart ? decodeURIComponent(titlePart) : "";
      domain = /^[\w.-]+\.[a-z]{2,}$/i.test(title) ? title : new URL(url.replace(/[.,;]+$/, "")).hostname;
    } catch {
      continue;
    }
    domain = domain.replace(/^www\./, "").toLowerCase();
    if (!out.has(domain)) out.set(domain, { url, domain, type: classifySource(url + " " + domain, vendorDomains) });
  }
  return [...out.values()];
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

export interface AnalysisInputs {
  target: string;
  brands: string[]; // target first
  queries: GeneratedQuery[];
  models: ModelInfo[];
  responses: ModelResponse[];
}

export function computeCompetitorStats({ target, brands, responses }: AnalysisInputs): CompetitorStat[] {
  const ok = responses.filter((r) => !r.error);
  const cited = ok.filter((r) => r.citations.length > 0);
  const stats = brands.map((name) => {
    const hits = ok.map((r) => r.mentions.find((m) => m.brand === name)).filter(Boolean) as BrandMention[];
    const citedHits = cited.filter((r) => r.mentions.some((m) => m.brand === name)).length;
    return {
      name,
      isTarget: name === target,
      mentionRate: pct(hits.length, ok.length),
      citationRate: pct(citedHits, cited.length),
      recommendationRate: pct(hits.filter((h) => h.recommended).length, ok.length),
      avgPosition: hits.length ? Math.round((hits.reduce((s, h) => s + h.position, 0) / hits.length) * 10) / 10 : null,
      gap: null as number | null,
    };
  });
  const t = stats.find((s) => s.isTarget)!;
  for (const s of stats) s.gap = s.isTarget ? null : s.mentionRate - t.mentionRate;
  return stats.sort((a, b) => b.mentionRate - a.mentionRate);
}

export function computeMetrics(target: string, responses: ModelResponse[]): MetricSet {
  const ok = responses.filter((r) => !r.error);
  const cited = ok.filter((r) => r.citations.length > 0);
  let score = 0;
  let mentioned = 0;
  let first = 0;
  for (const r of ok) {
    const m = r.mentions.find((x) => x.brand === target);
    if (!m) continue;
    mentioned++;
    if (m.position === 1) first++;
    score += m.position === 1 ? 1 : m.position <= 3 ? 0.6 : 0.35;
  }
  return {
    aiVisibility: pct(score, ok.length),
    mentionRate: pct(mentioned, ok.length),
    citationCoverage: pct(cited.filter((r) => r.mentions.some((m) => m.brand === target)).length, cited.length),
    recommendationRate: pct(first, ok.length),
  };
}

export function computeCitationSources(responses: ModelResponse[]): CitationSource[] {
  const map = new Map<string, { source: CitationSource; hits: Record<string, number> }>();
  for (const r of responses) {
    for (const c of r.citations) {
      const entry = map.get(c.domain) ?? { source: { domain: c.domain, type: c.type, count: 0, brandShare: {} }, hits: {} };
      entry.source.count++;
      for (const m of r.mentions) entry.hits[m.brand] = (entry.hits[m.brand] ?? 0) + 1;
      map.set(c.domain, entry);
    }
  }
  return [...map.values()]
    .map(({ source, hits }) => ({
      ...source,
      brandShare: Object.fromEntries(Object.entries(hits).map(([b, n]) => [b, pct(n, source.count)])),
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeModelStats(target: string, models: ModelInfo[], responses: ModelResponse[]): ModelStat[] {
  return models
    .map((m) => {
      const rs = responses.filter((r) => r.modelId === m.id);
      const ok = rs.filter((r) => !r.error);
      return {
        modelId: m.id,
        modelName: m.name,
        provider: m.provider,
        responses: ok.length,
        errors: rs.length - ok.length,
        mentionRate: pct(ok.filter((r) => r.mentions.some((x) => x.brand === target)).length, ok.length),
        recommendationRate: pct(ok.filter((r) => r.mentions.some((x) => x.brand === target && x.recommended)).length, ok.length),
      };
    })
    .sort((a, b) => b.mentionRate - a.mentionRate);
}

export function computeIntentStats(target: string, queries: GeneratedQuery[], responses: ModelResponse[]): IntentStat[] {
  const intents = [...new Set(queries.map((q) => q.intent))];
  return intents.map((intent) => {
    const ids = new Set(queries.filter((q) => q.intent === intent).map((q) => q.id));
    const ok = responses.filter((r) => ids.has(r.queryId) && !r.error);
    return {
      intent,
      queries: ids.size,
      mentionRate: pct(ok.filter((r) => r.mentions.some((m) => m.brand === target)).length, ok.length),
    };
  });
}

/** Rule-based findings, computed from the data. The LLM diagnosis adds the "why" on top. */
export function computeFindings(
  inputs: AnalysisInputs,
  competitors: CompetitorStat[],
  sources: CitationSource[],
): Finding[] {
  const { target, queries, responses } = inputs;
  const ok = responses.filter((r) => !r.error);
  const findings: Finding[] = [];

  const buying = queries.filter((q) => q.intent === "comparison" || q.intent === "alternative" || q.intent === "high intent");
  const absentQueries = buying.filter((q) => {
    const rs = ok.filter((r) => r.queryId === q.id);
    return rs.length > 0 && rs.filter((r) => r.mentions.some((m) => m.brand === target)).length / rs.length < 0.5;
  });
  if (buying.length) {
    const rate = pct(absentQueries.length, buying.length);
    findings.push({
      id: "f-comparison",
      title: "Comparison query weakness",
      description: `${target} is missing from most answers on ${rate}% of high-intent and comparison queries — the queries where buyers are closest to choosing.`,
      metric: `${rate}%`,
      severity: rate >= 50 ? "high" : rate >= 25 ? "medium" : "low",
      evidenceQueryIds: absentQueries.slice(0, 6).map((q) => q.id),
    });
  }

  const leader = competitors.find((c) => !c.isTarget);
  if (leader) {
    const leaderFirst = ok.filter((r) => r.mentions.some((m) => m.brand === leader.name && m.recommended));
    const leaderIn = ok.filter((r) => r.mentions.some((m) => m.brand === leader.name));
    findings.push({
      id: "f-leader",
      title: "Competitor advantage",
      description: `${leader.name} appears in ${leader.mentionRate}% of relevant AI responses, and is recommended first in ${pct(leaderFirst.length, leaderIn.length)}% of them.`,
      metric: `${leader.mentionRate}%`,
      severity: (leader.gap ?? 0) >= 15 ? "high" : "medium",
      evidenceQueryIds: [...new Set(leaderFirst.map((r) => r.queryId))].slice(0, 6),
    });
  }

  const thirdParty = sources.filter((s) => s.type !== "vendor docs").slice(0, 12);
  if (thirdParty.length) {
    // Underrepresented = answers citing this source mention the target far less than the leading brand.
    const missing = thirdParty.filter((s) => {
      const lead = Math.max(0, ...Object.entries(s.brandShare).filter(([b]) => b !== target).map(([, v]) => v));
      return (s.brandShare[target] ?? 0) < lead * 0.75;
    });
    findings.push({
      id: "f-citation",
      title: "Citation gap",
      description: `Competitors are represented more often in the third-party sources AI assistants rely on. ${target} is underrepresented in ${missing.length} of the ${thirdParty.length} most-cited sources.`,
      metric: `${missing.length}/${thirdParty.length}`,
      severity: missing.length / thirdParty.length > 0.6 ? "high" : "medium",
      evidenceQueryIds: [...new Set(ok.filter((r) => r.citations.length && !r.mentions.some((m) => m.brand === target)).map((r) => r.queryId))].slice(0, 6),
    });
  }
  return findings;
}
