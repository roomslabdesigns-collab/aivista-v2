import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SectionCard } from "../components/blocks";
import { Badge, Card, Meter, PageHeader, RequireReport } from "../components/ui";

const COLORS = ["#2563eb", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#64748b", "#ec4899"];

export function Citations() {
  return (
    <RequireReport>
      {(report) => {
        const target = report.company.companyName;
        const byType = Object.entries(
          report.citationSources.reduce<Record<string, number>>((acc, s) => ((acc[s.type] = (acc[s.type] ?? 0) + s.count), acc), {}),
        ).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
        const citedAnswers = report.responses.filter((r) => r.citations.length).length;

        if (!report.citationSources.length)
          return (
            <div className="space-y-6">
              <PageHeader title="Citation Intelligence" />
              <Card className="p-10 text-center text-sm text-slate-500">
                None of the tested assistants returned citations in this run. Enable <code className="rounded bg-slate-100 px-1">GEMINI_GROUNDED_TESTING</code> to test an assistant grounded in Google Search.
              </Card>
            </div>
          );

        return (
          <div className="space-y-6">
            <PageHeader title="Citation Intelligence" subtitle={`The sources AI assistants rely on — ${citedAnswers} of ${report.responses.length} answers cited sources`} />
            <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
              <SectionCard title="Source types">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byType} dataKey="count" nameKey="type" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1.5 px-6 text-[13px]">
                  {byType.map((t, i) => (
                    <li key={t.type} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 capitalize">{t.type}</span><span className="text-slate-500">{t.count}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
              <SectionCard title="Most-cited sources" subtitle={`How often answers citing each source mention ${target} vs. the strongest competitor`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="px-6 py-2 font-medium">Source</th>
                        <th className="px-4 py-2 font-medium">Citations</th>
                        <th className="w-40 px-4 py-2 font-medium">{target}</th>
                        <th className="px-4 py-2 font-medium">Top competitor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.citationSources.slice(0, 20).map((s) => {
                        const [lead, leadShare] = Object.entries(s.brandShare).filter(([b]) => b !== target).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
                        const mine = s.brandShare[target] ?? 0;
                        return (
                          <tr key={s.domain} className="border-t border-slate-100">
                            <td className="px-6 py-2.5"><div className="font-medium">{s.domain}</div><Badge className="mt-0.5">{s.type}</Badge></td>
                            <td className="px-4 py-2.5">{s.count}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2"><Meter value={mine} color={mine < leadShare * 0.75 ? "bg-red-400" : "bg-emerald-500"} /><span className="w-9 text-xs">{mine}%</span></div>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">{lead} · {leadShare}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </div>
          </div>
        );
      }}
    </RequireReport>
  );
}
