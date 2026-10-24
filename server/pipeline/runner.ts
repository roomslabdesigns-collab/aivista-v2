// Orchestrates one analysis: Investigate → Test → Analyze → Diagnose → Recommend → Project impact.
import { and, asc, eq, lt } from "drizzle-orm";
import type {
  AnalysisSummary, CompanyInput, Mode, ModelResponse, Report, StepId, StepState, StepStatus,
} from "../../shared/types.js";
import { PIPELINE_STEPS } from "../../shared/types.js";
import { db } from "../db/client.js";
import { analyses, experiments, responses as responsesTable } from "../db/schema.js";
import { emit } from "../events.js";
import { domainOf } from "./crawl.js";
import type { Engine, RunContext } from "./engine.js";
import { demoEngine } from "./demo.js";
import { liveEngine } from "./live.js";
import {
  brandAliases, computeCitationSources, computeCompetitorStats, computeFindings, computeIntentStats,
  computeMetrics, computeModelStats, detectMentions, extractCitations,
} from "./metrics.js";
import { buildKpis, buildTrend, expectedLift, proposeExperiments, type HistoryPoint } from "./impact.js";

const newId = () => crypto.randomUUID().slice(0, 8);

export async function startAnalysis(input: CompanyInput, mode: Mode, workspaceId: string, scheduleId?: string): Promise<string> {
  const id = newId();
  const steps: StepState[] = PIPELINE_STEPS.map((s) => ({ ...s, status: "pending" }));
  await db.insert(analyses).values({
    id,
    workspaceId,
    scheduleId: scheduleId ?? null,
    companyName: input.companyName,
    domain: domainOf(input.websiteUrl),
    mode,
    status: "running",
    input: JSON.stringify(input),
    steps: JSON.stringify(steps),
    createdAt: new Date().toISOString(),
  });
  void run(id, input, mode, steps, workspaceId);
  return id;
}

async function run(id: string, input: CompanyInput, mode: Mode, steps: StepState[], workspaceId: string) {
  const started = Date.now();
  const domain = domainOf(input.websiteUrl);
  let persistTimer: NodeJS.Timeout | undefined;

  const persistSteps = () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void db.update(analyses).set({ steps: JSON.stringify(steps) }).where(eq(analyses.id, id));
    }, 250);
  };

  const ctx: RunContext = {
    id,
    input,
    domain,
    step(stepId: StepId, status: StepStatus, detail?: string) {
      const s = steps.find((x) => x.id === stepId)!;
      s.status = status;
      if (detail !== undefined) s.detail = detail;
      emit(id, { type: "steps", steps: structuredClone(steps) });
      persistSteps();
    },
    log(message) {
      console.log(`[${id}] ${message}`);
      emit(id, { type: "log", message });
    },
  };

  const engine: Engine = mode === "live" ? liveEngine : demoEngine;

  try {
    const inv = await engine.investigate(ctx);

    // ── Competitor + citation analysis ───────────────────────────────
    ctx.step("mentions", "running");
    const target = input.companyName;
    const competitorNames = [...new Set([...input.competitors, ...inv.discoveredCompetitors])].filter(
      (c) => c.toLowerCase() !== target.toLowerCase(),
    );
    const brandDefs = [
      { name: target, aliases: brandAliases(target, domain) },
      ...competitorNames.map((c) => ({ name: c, aliases: brandAliases(c) })),
    ];
    const vendorDomains = [domain, ...competitorNames.map((c) => c.toLowerCase().replace(/\s+/g, ""))];
    const responses: ModelResponse[] = inv.responses.map(({ urls, ...r }) => ({
      ...r,
      mentions: r.error ? [] : detectMentions(r.text, brandDefs),
      citations: r.error ? [] : extractCitations(r.text, urls, vendorDomains),
    }));
    const inputs = { target, brands: [target, ...competitorNames], queries: inv.queries, models: inv.models, responses };
    const competitors = computeCompetitorStats(inputs);
    const metrics = computeMetrics(target, responses);
    ctx.step("mentions", "done", `${competitors.length - 1} competitors detected`);

    ctx.step("citations", "running");
    const citationSources = computeCitationSources(responses);
    const modelStats = computeModelStats(target, inv.models, responses);
    const intentStats = computeIntentStats(target, inv.queries, responses);
    ctx.step("citations", "done", `${citationSources.length} citation sources analyzed`);

    // ── Visibility gap diagnosis + recommendations ───────────────────
    const ruleFindings = computeFindings(inputs, competitors, citationSources);
    const diagnosis = await engine.diagnose(ctx, {
      site: inv.site, queries: inv.queries, responses, competitors, findings: ruleFindings, intentStats, citationSources,
    });

    // ── Measure impact (projection) ──────────────────────────────────
    ctx.step("impact", "running");
    const competitorAvg = avg(competitors.filter((c) => !c.isTarget).map((c) => c.mentionRate));
    const history = inv.historyFor ? inv.historyFor(metrics, competitorAvg) : await loadHistory(workspaceId, domain, id);
    const now = new Date().toISOString();
    const { trend, actionIndex } = buildTrend(history, { date: now, metrics, competitorAvg }, diagnosis.recommendations);
    const exps = proposeExperiments(id, diagnosis.recommendations, metrics.mentionRate);
    const top = diagnosis.recommendations[0];
    ctx.step("impact", "done", `+${expectedLift(diagnosis.recommendations, metrics.mentionRate)} pts projected`);

    const report: Report = {
      analysisId: id,
      company: input,
      mode,
      createdAt: new Date(started).toISOString(),
      completedAt: now,
      durationMs: Date.now() - started,
      goal: diagnosis.goal,
      site: inv.site,
      queries: inv.queries,
      models: inv.models,
      responses: [],
      competitors,
      discoveredCompetitors: inv.discoveredCompetitors,
      kpis: buildKpis(history, metrics),
      findings: [...ruleFindings, ...diagnosis.findings],
      recommendations: diagnosis.recommendations,
      contentGaps: diagnosis.contentGaps,
      citationSources,
      modelStats,
      intentStats,
      trend,
      actionIndex,
      topOpportunity: top ? { title: top.title, lift: Math.round((top.estimatedLift * top.confidence) / 100) } : null,
      experiments: [],
    };

    if (responses.length) {
      for (let i = 0; i < responses.length; i += 100) {
        await db.insert(responsesTable).values(
          responses.slice(i, i + 100).map((r) => ({
            ...r, id: `${id}-${r.id}`, analysisId: id, mentions: JSON.stringify(r.mentions), citations: JSON.stringify(r.citations),
          })),
        );
      }
    }
    if (exps.length) await db.insert(experiments).values(exps);

    clearTimeout(persistTimer);
    await db.update(analyses)
      .set({ status: "completed", report: JSON.stringify(report), steps: JSON.stringify(steps), completedAt: now })
      .where(eq(analyses.id, id));
    emit(id, { type: "steps", steps });
    emit(id, { type: "status", status: "completed" });
    ctx.log(`Completed in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`[${id}] failed`, err);
    for (const s of steps) if (s.status === "running") s.status = "error";
    clearTimeout(persistTimer);
    await db.update(analyses).set({ status: "failed", error: message, steps: JSON.stringify(steps) }).where(eq(analyses.id, id));
    emit(id, { type: "steps", steps });
    emit(id, { type: "status", status: "failed", error: message });
  }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

async function loadHistory(workspaceId: string, domain: string, excludeId: string): Promise<HistoryPoint[]> {
  const rows = await db.select().from(analyses)
    .where(and(
      eq(analyses.workspaceId, workspaceId), eq(analyses.domain, domain), eq(analyses.status, "completed"),
      eq(analyses.mode, "live"), lt(analyses.createdAt, new Date().toISOString()),
    ))
    .orderBy(asc(analyses.createdAt));
  return rows
    .filter((r) => r.id !== excludeId && r.report)
    .slice(-6)
    .map((r) => {
      const rep = JSON.parse(r.report!) as Report;
      return {
        date: rep.completedAt,
        metrics: {
          aiVisibility: rep.kpis.aiVisibility, mentionRate: rep.kpis.mentionRate,
          citationCoverage: rep.kpis.citationCoverage, recommendationRate: rep.kpis.recommendationRate,
        },
        competitorAvg: avg(rep.competitors.filter((c) => !c.isTarget).map((c) => c.mentionRate)),
      };
    });
}

export function toSummary(row: typeof analyses.$inferSelect): AnalysisSummary {
  return {
    id: row.id,
    companyName: row.companyName,
    domain: row.domain,
    mode: row.mode as Mode,
    status: row.status as AnalysisSummary["status"],
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? undefined,
    error: row.error ?? undefined,
  };
}

/** Marks runs interrupted by a server restart as failed. */
export async function recoverInterrupted() {
  await db.update(analyses).set({ status: "failed", error: "Interrupted by a server restart" }).where(eq(analyses.status, "running"));
}
