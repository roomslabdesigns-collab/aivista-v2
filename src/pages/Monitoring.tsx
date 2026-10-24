import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Play, Plus, Trash2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Frequency, Schedule } from "../../shared/types";
import { api } from "../api";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { useApp } from "../state";

const FREQS: Frequency[] = ["daily", "weekly", "monthly"];
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function Monitoring() {
  const { detail, select, reloadList } = useApp();
  const [items, setItems] = useState<Schedule[] | null>(null);
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.schedules().then(setItems).catch((e) => setError(e.message)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const monitored = items?.some((s) => detail && s.domain === detail.summary.domain && s.mode === detail.summary.mode);

  return (
    <div className="space-y-6">
      <PageHeader title="Monitoring" subtitle="Re-run analyses automatically to measure how your AI visibility changes over time" />

      {detail && !monitored && (
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><CalendarClock className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Monitor {detail.summary.companyName}</div>
            <div className="text-[13px] text-slate-500">Re-test the same {detail.input.queryCount} queries on a schedule ({detail.summary.mode} mode).</div>
          </div>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm capitalize outline-none focus:border-brand-500">
            {FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <Button onClick={() => act(() => api.createSchedule(detail.input, detail.summary.mode, frequency))}>
            <Plus className="size-4" />Start monitoring
          </Button>
        </Card>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {items?.map((s) => (
          <Card key={s.id} className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{s.companyName}</h2>
                  <Badge tone={s.mode === "live" ? "green" : "amber"}>{s.mode}</Badge>
                  <Badge tone={s.enabled ? "blue" : "slate"}>{s.enabled ? "active" : "paused"}</Badge>
                </div>
                <div className="mt-0.5 text-[13px] text-slate-500">{s.domain}</div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={s.enabled} className="accent-brand-600"
                  onChange={(e) => act(() => api.updateSchedule(s.id, { enabled: e.target.checked }))} />
                Enabled
              </label>
            </div>

            <div className="mt-4 h-32">
              {s.history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.history.map((h) => ({ ...h, label: new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }))} margin={{ left: -24, right: 8, top: 6 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Line name="Mention rate" dataKey="mentionRate" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                    <Line name="AI visibility" dataKey="aiVisibility" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-xl bg-slate-50 text-center text-xs text-slate-500">
                  The trend appears after the second run.<br />{s.history.length} completed run so far.
                </div>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-xs text-slate-500">Frequency</dt>
                <dd>
                  <select value={s.frequency} onChange={(e) => act(() => api.updateSchedule(s.id, { frequency: e.target.value as Frequency }))}
                    className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1 text-[13px] capitalize outline-none">
                    {FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </dd>
              </div>
              <div><dt className="text-xs text-slate-500">Next run</dt><dd className="mt-1 font-medium">{s.enabled ? fmt(s.nextRunAt) : "Paused"}</dd></div>
              <div><dt className="text-xs text-slate-500">Last run</dt><dd className="mt-1">{s.lastRunAt ? fmt(s.lastRunAt) : "Not yet"}</dd></div>
              <div><dt className="text-xs text-slate-500">Runs measured</dt><dd className="mt-1">{s.history.length}</dd></div>
            </dl>
            {s.lastError && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{s.lastError}</p>}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => act(async () => {
                const { id } = await api.runSchedule(s.id);
                await reloadList();
                select(id);
              })}>
                <Play className="size-4" />Run now
              </Button>
              <Button variant="ghost" className="text-red-600 hover:bg-red-50"
                onClick={() => confirm(`Stop monitoring ${s.companyName}?`) && act(() => api.deleteSchedule(s.id))}>
                <Trash2 className="size-4" />Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {items && !items.length && (
        <Card className="p-10 text-center text-sm text-slate-500">
          No monitored companies yet. {detail ? "Start monitoring the current analysis above." : "Launch an analysis first."}
        </Card>
      )}
    </div>
  );
}
