import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { Finding, Recommendation, Report } from "../../shared/types";
import { Badge, Card, CardHeader, cx, levelTone, targetStatus } from "./ui";
import { useQueryDrawer } from "./QueryDrawer";

export function CompetitorTable({ report, compact }: { report: Report; compact?: boolean }) {
  const rows = compact ? report.competitors.slice(0, 6) : report.competitors;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            {["Competitor", "Mention Rate", "Citation Rate", "Recommendation Rate", "Avg. Position", "Gap"].map((h) => (
              <th key={h} className="px-6 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name} className={cx("border-t border-slate-100", c.isTarget && "bg-brand-50/60 font-semibold")}>
              <td className="px-6 py-3">
                {c.name}
                {report.discoveredCompetitors.includes(c.name) && <Badge tone="violet" className="ml-2 font-normal">discovered</Badge>}
              </td>
              <td className="px-6 py-3">{c.mentionRate}%</td>
              <td className="px-6 py-3">{c.citationRate}%</td>
              <td className="px-6 py-3">{c.recommendationRate}%</td>
              <td className="px-6 py-3">{c.avgPosition ?? "—"}</td>
              <td className="px-6 py-3">
                {c.gap === null ? <span className="text-slate-400">—</span> : (
                  <span className={cx("font-semibold", c.gap > 0 ? "text-red-500" : "text-emerald-600")}>{c.gap > 0 ? "+" : ""}{c.gap}%</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpportunityCards({ recs, limit }: { recs: Recommendation[]; limit?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {recs.slice(0, limit ?? recs.length).map((r, i) => (
        <div key={r.id} className="rounded-2xl border border-slate-200/80 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">{i + 1}</span>
            <h3 className="text-sm font-semibold leading-snug">{r.title}</h3>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={levelTone(r.impact)}>{r.impact[0].toUpperCase() + r.impact.slice(1)} impact</Badge>
            <Badge tone="blue">{r.confidence}% confidence</Badge>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-600">{r.description}</p>
        </div>
      ))}
    </div>
  );
}

export function FindingsList({ report, findings }: { report: Report; findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(findings[0]?.id ?? null);
  const drawer = useQueryDrawer();
  const target = report.company.companyName;
  const sevColor = { high: "text-red-500", medium: "text-amber-500", low: "text-slate-500" };

  return (
    <div className="space-y-3">
      {findings.map((f, i) => {
        const isOpen = open === f.id;
        const queries = f.evidenceQueryIds.map((id) => report.queries.find((q) => q.id === id)).filter(Boolean).slice(0, 4);
        return (
          <div key={f.id} className="rounded-2xl border border-slate-200/80">
            <button onClick={() => setOpen(isOpen ? null : f.id)} className="flex w-full items-start gap-4 px-5 py-4 text-left">
              <span className="mt-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{f.title}</div>
                <p className="mt-1 text-[13px] text-slate-600">{f.description}</p>
              </div>
              <span className={cx("text-lg font-semibold", sevColor[f.severity])}>{f.metric}</span>
              <ChevronDown className={cx("mt-1 size-4 shrink-0 text-slate-400 transition", isOpen && "rotate-180")} />
            </button>
            {isOpen && queries.length > 0 && (
              <div className="border-t border-slate-100 px-5 pb-4 pt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Evidence</div>
                <div className="space-y-2">
                  {queries.map((q) => {
                    const rs = report.responses.filter((r) => r.queryId === q!.id && !r.error);
                    const best = rs.map((r) => targetStatus(r, target)).sort((a, b) => order(a.label) - order(b.label))[0] ?? targetStatus(undefined, target);
                    const others = topBrands(rs.flatMap((r) => r.mentions.filter((m) => m.brand !== target).map((m) => m.brand)), 2);
                    const share = rs.length ? Math.round((rs.filter((r) => r.mentions.some((m) => m.brand === target)).length / rs.length) * 100) : 0;
                    return (
                      <button key={q!.id} onClick={() => drawer.open([q!.id])}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5 text-left text-[13px] hover:bg-slate-50">
                        <span className="flex-1 truncate">"{q!.text}"</span>
                        <Badge tone={share >= 50 ? best.tone : "red"}>{share >= 50 ? best.label : `in ${share}% of answers`}</Badge>
                        <span className="hidden text-xs text-slate-400 sm:inline">{others.join(", ")}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => drawer.open(f.evidenceQueryIds)} className="mt-3 text-[13px] font-medium text-brand-600 hover:underline">Open full evidence →</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const order = (label: string) => (label.startsWith("position") ? 0 : label.startsWith("mentioned") ? 1 : 2);

export function topBrands(brands: string[], n: number) {
  const counts = new Map<string, number>();
  for (const b of brands) counts.set(b, (counts.get(b) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([b]) => b);
}

export function InvestigationSummary({ report }: { report: Report }) {
  const highImpact = report.recommendations.filter((r) => r.impact === "high").length;
  const mins = Math.floor(report.durationMs / 60000);
  const secs = Math.round((report.durationMs % 60000) / 1000);
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-600">
          <span className="grid size-5 place-items-center rounded-full bg-emerald-50">✓</span>Investigation complete
        </div>
        <div className="text-xs text-slate-400">{mins}m {secs}s · {new Date(report.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [report.queries.length, "Queries analyzed"],
          [report.competitors.length - 1, "Competitors detected"],
          [report.citationSources.length, "Citation sources analyzed"],
          [highImpact, "High-impact opportunities"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-xl border border-slate-100 px-4 py-3">
            <div className="text-2xl font-semibold">{n}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>
      {report.topOpportunity && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-navy-900 px-5 py-4 text-white">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-500"># Top opportunity</div>
            <div className="mt-1 font-semibold">{report.topOpportunity.title}</div>
            <div className="text-xs text-slate-400">Potential visibility impact <span className="font-semibold text-emerald-400">+{report.topOpportunity.lift}%</span></div>
          </div>
          <Link to="/analysis" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-navy-900 hover:bg-slate-100">View full investigation →</Link>
        </div>
      )}
    </Card>
  );
}

export function SectionCard({ title, subtitle, action, children, count }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; count?: string }) {
  return (
    <Card className="pb-5">
      <CardHeader title={title} subtitle={subtitle} action={action} count={count} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}
