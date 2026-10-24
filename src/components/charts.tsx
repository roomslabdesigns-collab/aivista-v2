import { useId, useState } from "react";
import { Info } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Kpis, MetricSet, Report } from "../../shared/types";
import { Card, CardHeader } from "./ui";

const KPI_META: { key: keyof MetricSet; label: string; color: string; help: string }[] = [
  { key: "aiVisibility", label: "AI Visibility", color: "#2563eb", help: "Weighted score: recommended first counts fully, top-3 mention 60%, any mention 35%." },
  { key: "mentionRate", label: "Mention Rate", color: "#8b5cf6", help: "Share of AI answers that mention your brand at all." },
  { key: "citationCoverage", label: "Citation Coverage", color: "#10b981", help: "Share of source-backed answers (with citations) that include your brand." },
  { key: "recommendationRate", label: "Recommendation Rate", color: "#f59e0b", help: "Share of AI answers that name your brand first." },
];

export function KpiCards({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {KPI_META.map((m) => <KpiCard key={m.key} meta={m} value={kpis[m.key]} delta={kpis.deltas?.[m.key] ?? null} spark={kpis.sparklines[m.key]} />)}
    </div>
  );
}

function KpiCard({ meta, value, delta, spark }: { meta: (typeof KPI_META)[number]; value: number; delta: number | null; spark: number[] }) {
  const gid = useId().replace(/:/g, "");
  const data = (spark.length > 1 ? spark : [value, value]).map((v, i) => ({ i, v }));
  return (
    <Card className="p-5">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
        {meta.label}
        <span title={meta.help}><Info className="size-3.5 text-slate-400" /></span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value}%</span>
        {delta !== null && (
          <span className={delta >= 0 ? "text-xs font-medium text-emerald-600" : "text-xs font-medium text-red-500"}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="mt-2 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={meta.color} stopOpacity={0.25} />
                <stop offset="1" stopColor={meta.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
            <Area type="monotone" dataKey="v" stroke={meta.color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] text-slate-400">{spark.length > 1 ? `vs. previous run` : "first run for this domain"}</div>
    </Card>
  );
}

export function VisibilityTrend({ report }: { report: Report }) {
  const [showProjection, setShowProjection] = useState(true);
  const { trend, actionIndex } = report;
  const action = actionIndex !== null ? trend[actionIndex]?.label : undefined;
  const last = trend.at(-1);
  const lastActual = trend.filter((t) => t.brand !== null).at(-1);
  const gapStart = trend.findIndex((t) => t.brand !== null && t.competitorAvg !== null && t.competitorAvg - t.brand >= 15);

  return (
    <Card className="h-full pb-4">
      <CardHeader
        title="AI Visibility Trend"
        subtitle="How often your brand appears in AI search recommendations — with projected impact if recommendations ship"
        action={
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
            <input type="checkbox" checked={showProjection} onChange={(e) => setShowProjection(e.target.checked)} className="accent-brand-600" />
            Show projection
          </label>
        }
      />
      <div className="mt-4 h-72 px-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 24, right: 40, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => (v === null ? "—" : `${v}%`)} />
            <Legend verticalAlign="top" align="left" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, left: 24, top: -4 }} />
            {gapStart >= 0 && lastActual && (
              <ReferenceArea x1={trend[gapStart].label} x2={lastActual.label} fill="#e0e7ff" fillOpacity={0.35} />
            )}
            {action && (
              <ReferenceLine x={action} stroke="#94a3b8" strokeDasharray="4 4"
                label={{ value: "Action implemented", position: "top", fontSize: 11, fill: "#0f172a", fontWeight: 600 }} />
            )}
            <Line name="Your brand" type="monotone" dataKey="brand" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
            <Line name="Competitor average" type="monotone" dataKey="competitorAvg" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            {showProjection && (
              <Line name="Projected (if implemented)" type="monotone" dataKey="projected" stroke="#10b981" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showProjection && last?.projected != null && lastActual?.brand != null && (
        <p className="px-6 text-xs text-slate-500">
          Projection: mention rate {lastActual.brand}% → <span className="font-semibold text-emerald-600">{last.projected}%</span> by {last.label}, assuming the recommendations ship.
          It's a confidence-weighted estimate — re-run the analysis after changes to measure the real effect.
        </p>
      )}
    </Card>
  );
}
