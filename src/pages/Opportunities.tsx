import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryDrawer } from "../components/QueryDrawer";
import { Badge, Card, PageHeader, RequireReport, levelTone } from "../components/ui";

export function Opportunities() {
  const drawer = useQueryDrawer();
  return (
    <RequireReport>
      {(report) => (
        <div className="space-y-6">
          <PageHeader title="Opportunities" subtitle="GEO recommendations ranked by impact — what to do so AI assistants recommend you first"
            actions={<Link to="/experiments" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Turn into experiments →</Link>} />
          <div className="space-y-4">
            {report.recommendations.map((r, i) => (
              <Card key={r.id} className="p-6">
                <div className="flex flex-wrap items-start gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{r.title}</h2>
                      <Badge>{r.category}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">{r.description}</p>
                    <ul className="mt-4 space-y-2">
                      {r.actions.map((a) => (
                        <li key={a} className="flex gap-2 text-[13px] text-slate-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />{a}</li>
                      ))}
                    </ul>
                    {r.targetQueryIds.length > 0 && (
                      <button onClick={() => drawer.open(r.targetQueryIds)} className="mt-4 text-[13px] font-medium text-brand-600 hover:underline">
                        {r.targetQueryIds.length} targeted queries →
                      </button>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={levelTone(r.impact)}>{r.impact} impact</Badge>
                    <Badge tone="blue">{r.confidence}% confidence</Badge>
                    <div className="mt-1 text-right">
                      <div className="text-2xl font-semibold text-emerald-600">+{Math.round((r.estimatedLift * r.confidence) / 100)} pts</div>
                      <div className="text-[11px] text-slate-400">expected mention-rate lift</div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </RequireReport>
  );
}
