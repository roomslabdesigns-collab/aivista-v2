import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CompetitorTable, SectionCard } from "../components/blocks";
import { PageHeader, RequireReport } from "../components/ui";

export function Competitors() {
  return (
    <RequireReport>
      {(report) => {
        const target = report.company.companyName;
        // For each competitor: in how many queries does it beat the target?
        const wins = report.competitors.filter((c) => !c.isTarget).map((c) => {
          let beats = 0;
          for (const q of report.queries) {
            const rs = report.responses.filter((r) => r.queryId === q.id && !r.error);
            const pos = (b: string) => rs.reduce((s, r) => s + (r.mentions.find((m) => m.brand === b)?.position ? 1 : 0), 0);
            if (pos(c.name) > pos(target)) beats++;
          }
          return { name: c.name, beats };
        });
        return (
          <div className="space-y-6">
            <PageHeader title="Competitors" subtitle={`Who AI assistants recommend instead of ${target}`} />
            <SectionCard title="Competitive Intelligence" subtitle="Mention, citation and recommendation rates across every tested AI answer">
              <CompetitorTable report={report} />
            </SectionCard>
            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard title="Share of AI answers" subtitle="Mentioned vs. recommended first">
                <div className="h-72 px-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.competitors} margin={{ left: -16, right: 16 }}>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="mentionRate" name="Mention rate" fill="#2563eb" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="recommendationRate" name="Recommended first" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
              <SectionCard title="Head-to-head" subtitle={`Queries where each competitor is mentioned more often than ${target}`}>
                <div className="space-y-3 px-6">
                  {wins.sort((a, b) => b.beats - a.beats).map((w) => (
                    <div key={w.name}>
                      <div className="flex justify-between text-[13px]"><span className="font-medium">{w.name}</span><span className="text-slate-500">{w.beats} / {report.queries.length} queries</span></div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-red-400" style={{ width: `${(w.beats / report.queries.length) * 100}%` }} />
                      </div>
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
