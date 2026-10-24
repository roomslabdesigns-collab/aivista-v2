import { Link } from "react-router-dom";
import { useApp } from "../state";
import { AgentPanel } from "../components/AgentPanel";
import { KpiCards, VisibilityTrend } from "../components/charts";
import { CompetitorTable, InvestigationSummary, OpportunityCards, SectionCard } from "../components/blocks";
import { Button, Card } from "../components/ui";

export function Overview() {
  const { report, detail, running, setModalOpen } = useApp();
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="xl:min-h-[560px]"><AgentPanel /></div>
        <div className="flex min-w-0 flex-col gap-6">
          {report ? (
            <>
              <KpiCards kpis={report.kpis} />
              <VisibilityTrend report={report} />
            </>
          ) : (
            <Card className="flex flex-1 flex-col items-center justify-center p-12 text-center">
              <h2 className="text-lg font-semibold">{running ? `Investigating ${detail?.summary.companyName}…` : "AI search visibility, investigated by an agent"}</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                {running
                  ? "The agent is crawling the site, generating customer queries and testing them across AI assistants. Metrics appear here when it finishes."
                  : "Enter a company and the agent will crawl its website, generate real customer questions, test them across 20+ AI assistants and tell you why competitors win."}
              </p>
              {!running && <Button className="mt-6" onClick={() => setModalOpen(true)}>Launch New Analysis</Button>}
            </Card>
          )}
        </div>
      </div>

      {report && (
        <>
          <InvestigationSummary report={report} />
          <SectionCard title="Competitive Intelligence" subtitle="How you compare against top competitors in AI search"
            action={<Link to="/competitors" className="shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-medium text-brand-600 ring-1 ring-slate-200 hover:bg-slate-50">View detailed analysis</Link>}>
            <CompetitorTable report={report} compact />
          </SectionCard>
          <SectionCard title="Key Opportunities"
            action={<Link to="/opportunities" className="shrink-0 text-[13px] font-medium text-brand-600 hover:underline">View all opportunities</Link>}>
            <div className="px-6"><OpportunityCards recs={report.recommendations} limit={3} /></div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
