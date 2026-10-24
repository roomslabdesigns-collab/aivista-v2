import { useState } from "react";
import type { QueryIntent } from "../../shared/types";
import { topBrands } from "../components/blocks";
import { useQueryDrawer } from "../components/QueryDrawer";
import { Badge, Card, Meter, PageHeader, RequireReport, cx, intentTone } from "../components/ui";
import { useApp } from "../state";

export function Queries() {
  const { search, setSearch } = useApp();
  const drawer = useQueryDrawer();
  const [intent, setIntent] = useState<QueryIntent | "all">("all");

  return (
    <RequireReport>
      {(report) => {
        const target = report.company.companyName;
        const needle = search.trim().toLowerCase();
        const rows = report.queries
          .filter((q) => intent === "all" || q.intent === intent)
          .map((q) => {
            const ok = report.responses.filter((r) => r.queryId === q.id && !r.error);
            const share = ok.length ? Math.round((ok.filter((r) => r.mentions.some((m) => m.brand === target)).length / ok.length) * 100) : 0;
            const brands = topBrands(ok.flatMap((r) => r.mentions.filter((m) => m.position === 1).map((m) => m.brand)), 1);
            return { q, share, winner: brands[0] ?? "—", answers: ok.length };
          })
          .filter((r) => !needle || r.q.text.toLowerCase().includes(needle) || r.winner.toLowerCase().includes(needle));
        const intents = ["all", ...new Set(report.queries.map((q) => q.intent))] as (QueryIntent | "all")[];

        return (
          <div className="space-y-6">
            <PageHeader title="Queries" subtitle={`${report.queries.length} customer queries generated from the website investigation and tested across ${report.models.length} AI assistants`}
              actions={<button onClick={() => drawer.open()} className="rounded-xl px-4 py-2 text-sm font-medium text-brand-600 ring-1 ring-slate-200 hover:bg-white">Open all evidence</button>} />
            <div className="flex flex-wrap items-center gap-2">
              {intents.map((i) => (
                <button key={i} onClick={() => setIntent(i)}
                  className={cx("rounded-full px-3 py-1.5 text-xs font-medium capitalize ring-1", intent === i ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
                  {i}
                </button>
              ))}
              {search && <button onClick={() => setSearch("")} className="ml-2 text-xs text-slate-500 hover:underline">Clear search "{search}"</button>}
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-6 py-3 font-medium">Query</th>
                    <th className="px-4 py-3 font-medium">Intent</th>
                    <th className="w-56 px-4 py-3 font-medium">{target} visibility</th>
                    <th className="px-4 py-3 font-medium">Most recommended</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ q, share, winner, answers }) => (
                    <tr key={q.id} onClick={() => drawer.open([q.id])} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium">"{q.text}"</td>
                      <td className="px-4 py-3"><Badge tone={intentTone(q.intent)}>{q.intent}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Meter value={share} color={share >= 50 ? "bg-emerald-500" : share >= 25 ? "bg-amber-400" : "bg-red-400"} />
                          <span className="w-20 shrink-0 text-xs text-slate-500">{share}% of {answers}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge tone={winner === target ? "green" : "slate"}>{winner}</Badge></td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-500">No queries match.</td></tr>}
                </tbody>
              </table>
            </Card>
          </div>
        );
      }}
    </RequireReport>
  );
}
