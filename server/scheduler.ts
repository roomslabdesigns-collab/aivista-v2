// Monitoring: re-runs an analysis on a schedule so visibility is measured over time,
// which is how the impact of shipped recommendations becomes real data instead of a projection.
import { and, asc, eq, lte } from "drizzle-orm";
import type { CompanyInput, Frequency, Mode, Report, Schedule } from "../shared/types.js";
import { db } from "./db/client.js";
import { analyses, schedules } from "./db/schema.js";
import { startAnalysis } from "./pipeline/runner.js";
import { domainOf } from "./pipeline/crawl.js";

export const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly"];

export function nextRun(from: Date, frequency: Frequency): Date {
  const d = new Date(from);
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  else if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export async function createSchedule(workspaceId: string, input: CompanyInput, mode: Mode, frequency: Frequency) {
  const id = crypto.randomUUID().slice(0, 8);
  const now = new Date();
  await db.insert(schedules).values({
    id, workspaceId, companyName: input.companyName, domain: domainOf(input.websiteUrl), input: JSON.stringify(input),
    mode, frequency, enabled: true, nextRunAt: nextRun(now, frequency).toISOString(), createdAt: now.toISOString(),
  });
  return id;
}

export async function listSchedules(workspaceId: string): Promise<Schedule[]> {
  const rows = await db.select().from(schedules).where(eq(schedules.workspaceId, workspaceId)).orderBy(asc(schedules.createdAt));
  const runs = await db.select().from(analyses)
    .where(and(eq(analyses.workspaceId, workspaceId), eq(analyses.status, "completed")))
    .orderBy(asc(analyses.createdAt));
  return rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    domain: r.domain,
    input: JSON.parse(r.input),
    mode: r.mode as Mode,
    frequency: r.frequency as Frequency,
    enabled: r.enabled,
    nextRunAt: r.nextRunAt,
    lastRunAt: r.lastRunAt ?? undefined,
    lastAnalysisId: r.lastAnalysisId ?? undefined,
    lastError: r.lastError ?? undefined,
    createdAt: r.createdAt,
    history: runs
      .filter((a) => a.domain === r.domain && a.mode === r.mode && a.report)
      .slice(-12)
      .map((a) => {
        const rep = JSON.parse(a.report!) as Report;
        return { analysisId: a.id, date: a.createdAt, mentionRate: rep.kpis.mentionRate, aiVisibility: rep.kpis.aiVisibility };
      }),
  }));
}

export async function runScheduleNow(id: string, canRunLive: () => boolean) {
  const [s] = await db.select().from(schedules).where(eq(schedules.id, id));
  if (!s) return null;
  const now = new Date();
  const next = nextRun(now, s.frequency as Frequency).toISOString();
  if (s.mode === "live" && !canRunLive()) {
    await db.update(schedules).set({ lastRunAt: now.toISOString(), nextRunAt: next, lastError: "Live mode is not configured (missing API keys)" })
      .where(eq(schedules.id, id));
    return null;
  }
  const analysisId = await startAnalysis(JSON.parse(s.input), s.mode as Mode, s.workspaceId, s.id);
  await db.update(schedules).set({ lastRunAt: now.toISOString(), nextRunAt: next, lastAnalysisId: analysisId, lastError: null })
    .where(eq(schedules.id, id));
  return analysisId;
}

let timer: NodeJS.Timeout | undefined;

export function startScheduler(canRunLive: () => boolean, intervalMs = 60_000) {
  const tick = async () => {
    try {
      const due = await db.select({ id: schedules.id }).from(schedules)
        .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, new Date().toISOString())));
      for (const s of due) {
        const id = await runScheduleNow(s.id, canRunLive);
        console.log(`[scheduler] schedule ${s.id} → ${id ?? "skipped"}`);
      }
    } catch (err) {
      console.error("[scheduler] tick failed", err);
    }
  };
  clearInterval(timer);
  timer = setInterval(tick, intervalMs);
  void tick();
}
