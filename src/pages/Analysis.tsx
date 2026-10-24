import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FindingsList, SectionCard } from "../components/blocks";
import { Badge, Card, PageHeader, RequireReport } from "../components/ui";

export function Analysis() {
  return (
    <RequireReport>
      {(report) => (
        <div className="space-y-6">
          <PageHeader title="AI Search Analysis" subtitle={`${report.company.companyName} · ${report.site.category} · tested across ${report.models.length} AI assistants`} />

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <SectionCard title="What the agent found" count={`${report.findings.length} findings`} subtitle="Findings derived from the agent's own tool runs. Each one opens the evidence it came from.">
              <div className="px-6"><FindingsList report={report} findings={report.findings} /></div>
            </SectionCard>

            <div className="space-y-6">
              <Card className="p-6">
                <h2 className="text-[15px] font-semibold">Website investigation</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{report.site.summary}</p>
                <dl className="mt-4 space-y-3 text-[13px]">
                  <Row label="Category" value={report.site.category} />
                  <Row label="Pages crawled" value={String(report.site.pagesCrawled)} />
                  {report.site.pricing && <Row label="Pricing" value={report.site.pricing} />}
                </dl>
                <Chips title="Audiences" items={report.site.audiences} />
                <Chips title="Features" items={report.site.features} />
                <Chips title="Differentiators" items={report.site.differentiators} />
              </Card>
            </div>
          </div>

          <SectionCard title="Visibility by AI assistant" subtitle="Share of each assistant's answers that mention your brand">
            <div className="px-4" style={{ height: Math.max(240, report.modelStats.length * 28) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.modelStats} layout="vertical" margin={{ left: 24, right: 24 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="%" />
                  <YAxis type="category" dataKey="modelName" width={170} tick={{ fontSize: 12, fill: "#334155" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.provider ?? ""}`} />
                  <Bar dataKey="mentionRate" name="Mention rate" radius={[0, 6, 6, 0]} barSize={14}>
                    {report.modelStats.map((m) => <Cell key={m.modelId} fill={m.mentionRate >= 50 ? "#2563eb" : m.mentionRate >= 25 ? "#93c5fd" : "#fca5a5"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {report.modelStats.some((m) => m.errors) && (
              <p className="px-6 pt-2 text-xs text-slate-500">
                <Badge tone="amber">note</Badge> {report.modelStats.reduce((s, m) => s + m.errors, 0)} calls failed (usually free-tier rate limits) and are excluded from the rates.
              </p>
            )}
          </SectionCard>
        </div>
      )}
    </RequireReport>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</div>
      <div className="flex flex-wrap gap-1.5">{items.map((i) => <Badge key={i}>{i}</Badge>)}</div>
    </div>
  );
}
