// Measure impact: projections of how visibility moves if recommendations are implemented.
// These are assumptions (confidence-weighted lift with diminishing returns), not measurements;
// re-running the analysis after shipping a change is what measures the real effect.
import type { Experiment, Kpis, MetricSet, Recommendation, TrendPoint } from "../../shared/types.js";

export interface HistoryPoint {
  date: string;
  metrics: MetricSet;
  competitorAvg: number;
}

const monthLabel = (d: Date) => d.toLocaleString("en-US", { month: "short", year: "2-digit" });

export function expectedLift(recs: Recommendation[], baseline: number): number {
  // Each recommendation's lift is weighted by confidence; overlapping actions yield diminishing returns.
  let remaining = 100 - baseline;
  let total = 0;
  const sorted = [...recs].sort((a, b) => b.estimatedLift * b.confidence - a.estimatedLift * a.confidence);
  for (const [i, r] of sorted.entries()) {
    const gain = Math.min(remaining * 0.6, ((r.estimatedLift * r.confidence) / 100) * 0.7 ** i);
    total += gain;
    remaining -= gain;
  }
  return Math.round(total);
}

export function buildTrend(
  history: HistoryPoint[],
  current: HistoryPoint,
  recs: Recommendation[],
  monthsAhead = 6,
): { trend: TrendPoint[]; actionIndex: number } {
  const trend: TrendPoint[] = history.map((h) => ({
    label: monthLabel(new Date(h.date)),
    brand: h.metrics.mentionRate,
    competitorAvg: h.competitorAvg,
    projected: null,
  }));
  trend.push({
    label: monthLabel(new Date(current.date)),
    brand: current.metrics.mentionRate,
    competitorAvg: current.competitorAvg,
    projected: current.metrics.mentionRate,
  });
  const actionIndex = trend.length - 1;
  const lift = expectedLift(recs, current.metrics.mentionRate);
  const start = new Date(current.date);
  for (let m = 1; m <= monthsAhead; m++) {
    const d = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const ramp = 1 - Math.exp(-0.55 * m); // most of the effect lands in the first 3–4 months
    trend.push({
      label: monthLabel(d),
      brand: null,
      competitorAvg: null,
      projected: Math.round(current.metrics.mentionRate + lift * ramp),
    });
  }
  return { trend, actionIndex };
}

export function buildKpis(history: HistoryPoint[], current: MetricSet): Kpis {
  const keys = ["aiVisibility", "mentionRate", "citationCoverage", "recommendationRate"] as const;
  const prev = history.at(-1)?.metrics;
  const sparklines = Object.fromEntries(keys.map((k) => [k, [...history.map((h) => h.metrics[k]), current[k]]])) as Kpis["sparklines"];
  const deltas = prev ? (Object.fromEntries(keys.map((k) => [k, current[k] - prev[k]])) as unknown as MetricSet) : null;
  return { ...current, deltas, sparklines };
}

export function proposeExperiments(analysisId: string, recs: Recommendation[], baseline: number): Experiment[] {
  return recs.slice(0, 4).map((r, i) => ({
    id: `${analysisId}-exp-${i + 1}`,
    analysisId,
    recommendationId: r.id,
    title: r.title,
    hypothesis: `If we ${r.actions[0]?.replace(/\.$/, "").replace(/^\w/, (c) => c.toLowerCase()) ?? r.title.toLowerCase()}, AI assistants will mention us in more of the targeted queries.`,
    metric: "AI mention rate on targeted queries",
    baseline,
    projected: Math.min(100, Math.round(baseline + (r.estimatedLift * r.confidence) / 100)),
    durationWeeks: r.impact === "high" ? 8 : r.impact === "medium" ? 6 : 4,
    status: "proposed",
    createdAt: new Date().toISOString(),
  }));
}
