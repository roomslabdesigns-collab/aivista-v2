import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../components/blocks";
import { Badge, Card, Meter, PageHeader, RequireReport } from "../components/ui";

export function Insights() {
  return (
    <RequireReport>
      {(report) => {
        const byProvider = Object.values(
          report.modelStats.reduce<Record<string, { provider: string; total: number; hits: number; models: number }>>((acc, m) => {
            const p = (acc[m.provider] ??= { provider: m.provider, total: 0, hits: 0, models: 0 });
            p.total += m.responses;
            p.hits += (m.mentionRate / 100) * m.responses;
            p.models++;
            return acc;
          }, {}),
        ).map((p) => ({ ...p, rate: p.total ? Math.round((p.hits / p.total) * 100) : 0 }));
        const best = [...report.intentStats].sort((a, b) => b.mentionRate - a.mentionRate);

        return (
          <div className="space-y-6">
            <PageHeader title="Visibility Insights" subtitle="Where your brand shows up in AI answers — and where it doesn't" />
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-5">
                <div className="text-xs text-slate-500">Strongest query type</div>
                <div className="mt-1 text-lg font-semibold capitalize">{best[0]?.intent}</div>
                <div className="text-sm text-emerald-600">{best[0]?.mentionRate}% mention rate</div>
              </Card>
              <Card className="p-5">
                <div className="text-xs text-slate-500">Weakest query type</div>
                <div className="mt-1 text-lg font-semibold capitalize">{best.at(-1)?.intent}</div>
                <div className="text-sm text-red-500">{best.at(-1)?.mentionRate}% mention rate</div>
              </Card>
              <Card className="p-5">
                <div className="text-xs text-slate-500">Most favorable assistant</div>
                <div className="mt-1 truncate text-lg font-semibold">{report.modelStats[0]?.modelName}</div>
                <div className="text-sm text-slate-500">{report.modelStats[0]?.mentionRate}% · {report.modelStats[0]?.provider}</div>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard title="Visibility by query intent" subtitle="Buyers comparing and switching are the queries closest to revenue">
                <div className="h-64 px-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.intentStats} margin={{ left: -16, right: 16 }}>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="intent" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="mentionRate" name="Mention rate" radius={[6, 6, 0, 0]} barSize={44}>
                        {report.intentStats.map((i) => <Cell key={i.intent} fill={i.mentionRate >= 50 ? "#2563eb" : "#f87171"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
              <SectionCard title="Visibility by provider" subtitle="Grouped across the models tested from each provider">
                <div className="space-y-4 px-6">
                  {byProvider.map((p) => (
                    <div key={p.provider}>
                      <div className="mb-1.5 flex items-center justify-between text-[13px]">
                        <span className="font-medium">{p.provider} <Badge className="ml-1">{p.models} models</Badge></span>
                        <span className="text-slate-500">{p.rate}%</span>
                      </div>
                      <Meter value={p.rate} />
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        );
      }}
    </RequireReport>
  );
}
