import { useState } from "react";
import { Check, FlaskConical, Play, RotateCcw, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Experiment, ExperimentStatus } from "../../shared/types";
import { api } from "../api";
import { Badge, Button, Card, PageHeader, RequireReport, type Tone } from "../components/ui";
import { useApp } from "../state";

const STATUS_TONE: Record<ExperimentStatus, Tone> = { proposed: "slate", approved: "blue", running: "violet", completed: "green", rejected: "red" };

export function Experiments() {
  const { reload, launch, detail } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const set = async (e: Experiment, status: ExperimentStatus) => {
    setBusy(e.id);
    await api.setExperiment(e.id, status);
    await reload();
    setBusy(null);
  };

  return (
    <RequireReport>
      {(report) => (
        <div className="space-y-6">
          <PageHeader title="Experiments" subtitle="The agent proposes; you approve. Approved experiments are measured by re-running the analysis."
            actions={detail && (
              <Button variant="secondary" onClick={() => launch(detail.input, detail.summary.mode)}>
                <RotateCcw className="size-4" />Re-run analysis to measure impact
              </Button>
            )} />
          <div className="grid gap-4 lg:grid-cols-2">
            {report.experiments.map((e) => (
              <Card key={e.id} className="p-6">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><FlaskConical className="size-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{e.title}</h2>
                      <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] text-slate-600">{e.hypothesis}</p>
                  </div>
                </div>
                <ImpactChart e={e} />
                <div className="mt-2 grid grid-cols-3 gap-3 text-center text-[13px]">
                  <Stat label="Baseline" value={`${e.baseline}%`} />
                  <Stat label="Projected" value={`${e.projected}%`} accent />
                  <Stat label="Duration" value={`${e.durationWeeks} wks`} />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {e.status === "proposed" && (
                    <>
                      <Button onClick={() => set(e, "approved")} disabled={busy === e.id}><Check className="size-4" />Approve</Button>
                      <Button variant="secondary" onClick={() => set(e, "rejected")} disabled={busy === e.id}><X className="size-4" />Reject</Button>
                    </>
                  )}
                  {e.status === "approved" && <Button onClick={() => set(e, "running")} disabled={busy === e.id}><Play className="size-4" />Mark as started</Button>}
                  {e.status === "running" && <Button onClick={() => set(e, "completed")} disabled={busy === e.id}><Check className="size-4" />Mark as completed</Button>}
                  {(e.status === "rejected" || e.status === "completed") && (
                    <Button variant="ghost" onClick={() => set(e, "proposed")} disabled={busy === e.id}><RotateCcw className="size-4" />Reset</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {!report.experiments.length && <Card className="p-10 text-center text-sm text-slate-500">No experiments proposed for this analysis.</Card>}
        </div>
      )}
    </RequireReport>
  );
}

function ImpactChart({ e }: { e: Experiment }) {
  // Week-by-week projection: the change ramps in, the control stays flat.
  const data = Array.from({ length: e.durationWeeks + 1 }, (_, w) => ({
    week: w === 0 ? "Start" : `W${w}`,
    control: e.baseline,
    projected: Math.round((e.baseline + (e.projected - e.baseline) * (1 - Math.exp((-3 * w) / e.durationWeeks))) * 10) / 10,
  }));
  return (
    <div className="mt-4 h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
          <Line name="Without change" dataKey="control" stroke="#94a3b8" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Line name="With change (projected)" dataKey="projected" stroke="#10b981" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className={accent ? "font-semibold text-emerald-600" : "font-semibold"}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
