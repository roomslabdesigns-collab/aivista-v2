import { Badge, Card, PageHeader, RequireReport, levelTone } from "../components/ui";

export function ContentGaps() {
  return (
    <RequireReport>
      {(report) => (
        <div className="space-y-6">
          <PageHeader title="Content Gaps" subtitle="Topics competitors cover that AI assistants can't find on your site" />
          <div className="grid gap-4 md:grid-cols-2">
            {report.contentGaps.map((g) => (
              <Card key={g.id} className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{g.topic}</h2>
                  <Badge tone={levelTone(g.priority)}>{g.priority} priority</Badge>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{g.description}</p>
                {g.competitorsCovering.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Covered by</span>
                    {g.competitorsCovering.map((c) => <Badge key={c}>{c}</Badge>)}
                  </div>
                )}
              </Card>
            ))}
          </div>
          {!report.contentGaps.length && <Card className="p-10 text-center text-sm text-slate-500">No content gaps identified.</Card>}
        </div>
      )}
    </RequireReport>
  );
}
