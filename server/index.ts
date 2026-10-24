import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import type {
  AnalysisDetail, AppConfig, CompanyInput, Experiment, ExperimentStatus, Frequency, Mode, ModelResponse, Report,
} from "../shared/types.js";
import { attachUser, login, logout, pruneSessions, requireAuth, signup } from "./auth.js";
import { db, initDb } from "./db/client.js";
import { analyses, experiments, responses, schedules } from "./db/schema.js";
import { subscribe } from "./events.js";
import { jsRenderingAvailable } from "./pipeline/crawl.js";
import { RELAY_SAMPLE } from "./pipeline/demo.js";
import { recoverInterrupted, startAnalysis, toSummary } from "./pipeline/runner.js";
import { geminiReady } from "./providers/gemini.js";
import { PROVIDERS, providerStatus } from "./providers/registry.js";
import { FREQUENCIES, createSchedule, listSchedules, nextRun, runScheduleNow, startScheduler } from "./scheduler.js";

const PROD = process.argv.includes("--prod");
const app = express();
app.set("trust proxy", 1); // behind Render/Fly/Railway proxies, so req.secure reflects HTTPS
app.use(express.json({ limit: "1mb" }));
app.use(attachUser);

const liveReady = () => geminiReady() && PROVIDERS.some((p) => !!process.env[p.keyEnv]);
const ws = (req: Request) => req.user!.workspaceId;

// ── Auth ───────────────────────────────────────────────────────────────
app.post("/api/auth/signup", (req, res) =>
  // Every new workspace starts with the Relay CRM demo so the dashboard is never empty.
  signup(req, res, async (workspaceId) => void (await startAnalysis(RELAY_SAMPLE, "demo", workspaceId))),
);
app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);
app.get("/api/auth/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  res.json(req.user);
});

app.get("/api/config", async (_req, res) => {
  const config: AppConfig = {
    geminiReady: geminiReady(), liveReady: liveReady(), jsRendering: await jsRenderingAvailable(), providers: providerStatus(),
  };
  res.json(config);
});

app.use("/api", requireAuth);

app.get("/api/sample", (_req, res) => res.json(RELAY_SAMPLE));

// ── Analyses ───────────────────────────────────────────────────────────
async function ownedAnalysis(req: Request) {
  const [row] = await db.select().from(analyses).where(and(eq(analyses.id, String(req.params.id)), eq(analyses.workspaceId, ws(req))));
  return row;
}

function parseInput(i: Partial<CompanyInput>): CompanyInput | null {
  if (!i.websiteUrl?.trim() || !i.companyName?.trim()) return null;
  return {
    websiteUrl: i.websiteUrl.trim(),
    companyName: i.companyName.trim(),
    industry: i.industry?.trim() ?? "",
    targetMarket: i.targetMarket?.trim() ?? "",
    audience: i.audience?.trim() ?? "",
    competitors: (i.competitors ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 8),
    queryCount: Math.max(5, Math.min(40, Number(i.queryCount) || 10)),
  };
}

app.get("/api/analyses", async (req, res) => {
  const rows = await db.select().from(analyses).where(eq(analyses.workspaceId, ws(req))).orderBy(desc(analyses.createdAt));
  res.json(rows.map(toSummary));
});

app.post("/api/analyses", async (req, res) => {
  const body = req.body as { input?: Partial<CompanyInput>; mode?: Mode };
  const input = parseInput(body.input ?? {});
  if (!input) {
    res.status(400).json({ error: "Website URL and company name are required" });
    return;
  }
  const mode: Mode = body.mode === "live" ? "live" : "demo";
  if (mode === "live" && !liveReady()) {
    res.status(400).json({ error: "Live mode needs GEMINI_API_KEY plus at least one testing provider key in .env" });
    return;
  }
  const id = await startAnalysis(input, mode, ws(req));
  res.status(201).json({ id });
});

app.get("/api/analyses/:id", async (req, res) => {
  const row = await ownedAnalysis(req);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let report: Report | null = null;
  if (row.report) {
    report = JSON.parse(row.report) as Report;
    const rs = await db.select().from(responses).where(eq(responses.analysisId, row.id));
    report.responses = rs.map((r): ModelResponse => ({
      id: r.id, queryId: r.queryId, modelId: r.modelId, modelName: r.modelName, provider: r.provider, text: r.text,
      mentions: JSON.parse(r.mentions), citations: JSON.parse(r.citations), error: r.error ?? undefined, latencyMs: r.latencyMs,
    }));
    const ex = await db.select().from(experiments).where(eq(experiments.analysisId, row.id));
    report.experiments = ex.map((e) => ({ ...e, status: e.status as ExperimentStatus }));
  }
  const detail: AnalysisDetail = { summary: toSummary(row), input: JSON.parse(row.input), steps: JSON.parse(row.steps), report };
  res.json(detail);
});

app.delete("/api/analyses/:id", async (req, res) => {
  const row = await ownedAnalysis(req);
  if (row) {
    await db.delete(responses).where(eq(responses.analysisId, row.id));
    await db.delete(experiments).where(eq(experiments.analysisId, row.id));
    await db.delete(analyses).where(eq(analyses.id, row.id));
  }
  res.status(204).end();
});

// Live progress via Server-Sent Events.
app.get("/api/analyses/:id/events", async (req, res) => {
  const row = await ownedAnalysis(req);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const send = (data: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  if (!row) {
    send({ type: "status", status: "failed", error: "Not found" });
    res.end();
    return;
  }
  send({ type: "steps", steps: JSON.parse(row.steps) });
  if (row.status !== "running") {
    send({ type: "status", status: row.status, error: row.error ?? undefined });
    res.end();
    return;
  }
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
  const cleanup = () => {
    clearInterval(ping);
    unsubscribe();
  };
  const unsubscribe = subscribe(row.id, (e) => {
    send(e);
    if (e.type === "status" && e.status !== "running") {
      cleanup();
      res.end();
    }
  });
  req.on("close", cleanup);
});

// ── Experiments: human approval flow ───────────────────────────────────
app.patch("/api/experiments/:id", async (req, res) => {
  const allowed: ExperimentStatus[] = ["proposed", "approved", "running", "completed", "rejected"];
  const status = req.body?.status as ExperimentStatus;
  if (!allowed.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [row] = await db.select({ e: experiments }).from(experiments)
    .innerJoin(analyses, eq(experiments.analysisId, analyses.id))
    .where(and(eq(experiments.id, req.params.id), eq(analyses.workspaceId, ws(req))));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.update(experiments).set({ status }).where(eq(experiments.id, req.params.id));
  res.json({ ...row.e, status } satisfies Experiment);
});

// ── Monitoring schedules ───────────────────────────────────────────────
async function ownedSchedule(req: Request) {
  const [row] = await db.select().from(schedules).where(and(eq(schedules.id, String(req.params.id)), eq(schedules.workspaceId, ws(req))));
  return row;
}

app.get("/api/schedules", async (req, res) => res.json(await listSchedules(ws(req))));

app.post("/api/schedules", async (req, res) => {
  const body = req.body as { input?: Partial<CompanyInput>; mode?: Mode; frequency?: Frequency };
  const input = parseInput(body.input ?? {});
  const frequency = FREQUENCIES.includes(body.frequency as Frequency) ? (body.frequency as Frequency) : "weekly";
  if (!input) {
    res.status(400).json({ error: "Website URL and company name are required" });
    return;
  }
  const id = await createSchedule(ws(req), input, body.mode === "live" ? "live" : "demo", frequency);
  res.status(201).json({ id });
});

app.patch("/api/schedules/:id", async (req, res) => {
  const s = await ownedSchedule(req);
  if (!s) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const patch: Partial<typeof schedules.$inferInsert> = {};
  if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
  if (FREQUENCIES.includes(req.body?.frequency)) {
    patch.frequency = req.body.frequency;
    patch.nextRunAt = nextRun(new Date(), req.body.frequency).toISOString();
  }
  if (Object.keys(patch).length) await db.update(schedules).set(patch).where(eq(schedules.id, s.id));
  res.json((await listSchedules(ws(req))).find((x) => x.id === s.id));
});

app.post("/api/schedules/:id/run", async (req, res) => {
  const s = await ownedSchedule(req);
  if (!s) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const analysisId = await runScheduleNow(s.id, liveReady);
  if (!analysisId) {
    res.status(400).json({ error: "Live mode is not configured (missing API keys)" });
    return;
  }
  res.status(201).json({ id: analysisId });
});

app.delete("/api/schedules/:id", async (req, res) => {
  const s = await ownedSchedule(req);
  if (s) await db.delete(schedules).where(eq(schedules.id, s.id));
  res.status(204).end();
});

// ── Static UI in production ────────────────────────────────────────────
if (PROD) {
  const dist = path.resolve("dist");
  if (!existsSync(dist)) throw new Error("Run `npm run build` first");
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// In production the host (Render, Railway…) assigns PORT. In dev we use API_PORT, because
// tools that launch the Vite dev server often set PORT for the UI.
const port = Number(PROD ? process.env.PORT || process.env.API_PORT : process.env.API_PORT) || 3001;
await initDb();
await recoverInterrupted();
await pruneSessions();
startScheduler(liveReady);

// HOST=127.0.0.1 on a server behind a reverse proxy (Caddy), so only the proxy can reach the app.
app.listen(port, process.env.HOST || "0.0.0.0", () => {
  console.log(`AIVista API on http://localhost:${port}${PROD ? "" : "  (UI: http://localhost:5173)"}`);
  console.log(`Live mode: ${liveReady() ? "ready" : "not configured — demo mode only (add keys to .env)"}`);
});
