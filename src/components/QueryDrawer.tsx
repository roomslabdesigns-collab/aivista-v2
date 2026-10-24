import { createContext, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { GeneratedQuery, ModelResponse, Report } from "../../shared/types";
import { useApp } from "../state";
import { Badge, cx, intentTone, targetStatus } from "./ui";
import { topBrands } from "./blocks";

const Ctx = createContext<{ open: (queryIds?: string[]) => void }>({ open: () => {} });
export const useQueryDrawer = () => useContext(Ctx);

export function QueryDrawerProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const { report } = useApp();
  return (
    <Ctx.Provider value={{ open: (q) => setIds(q?.length ? q : report?.queries.map((x) => x.id) ?? []) }}>
      {children}
      <AnimatePresence>
        {ids && report && <Drawer report={report} ids={ids} onClose={() => setIds(null)} />}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

function Drawer({ report, ids, onClose }: { report: Report; ids: string[]; onClose: () => void }) {
  const queries = ids.map((id) => report.queries.find((q) => q.id === id)).filter(Boolean) as GeneratedQuery[];
  return (
    <div className="fixed inset-0 z-50">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-navy-950/50" onClick={onClose} />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Evidence</div>
            <h2 className="mt-1 text-lg font-semibold">Analyzed customer queries</h2>
            <p className="text-[13px] text-slate-500">Every query the agent generated, tested and scored across {report.models.length} AI assistants.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {queries.map((q) => <QueryEvidence key={q.id} report={report} query={q} />)}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
          Showing {queries.length} of {report.queries.length} analyzed queries
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Close</button>
        </div>
      </motion.aside>
    </div>
  );
}

export function QueryEvidence({ report, query }: { report: Report; query: GeneratedQuery }) {
  const [showAll, setShowAll] = useState(false);
  const target = report.company.companyName;
  const rs = report.responses.filter((r) => r.queryId === query.id);
  const ok = rs.filter((r) => !r.error);
  const sample = ok.find((r) => r.citations.length) ?? ok[0];
  const brands = topBrands(ok.flatMap((r) => r.mentions.map((m) => m.brand)), 5);
  const cited = [...new Set(ok.flatMap((r) => r.citations.map((c) => c.type)))].slice(0, 4);
  const share = ok.length ? Math.round((ok.filter((r) => r.mentions.some((m) => m.brand === target)).length / ok.length) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200/80 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={intentTone(query.intent)}>{query.intent}</Badge>
        <span className="text-sm font-semibold">"{query.text}"</span>
      </div>
      {sample && (
        // Padding on the wrapper, clamp on the text: otherwise half of the 5th line peeks through the padding.
        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
          <p className="line-clamp-4 whitespace-pre-line text-[13px] text-slate-600">{stripMd(sample.text)}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Brands</span>
        {brands.map((b) => <Badge key={b} tone={b === target ? "blue" : "slate"}>{b}</Badge>)}
        <span className="ml-auto text-xs text-slate-500">{target} in <b className={share >= 50 ? "text-emerald-600" : "text-red-500"}>{share}%</b> of {ok.length} answers</span>
      </div>
      {cited.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Cited</span>
          {cited.map((c) => <Badge key={c}>{c}</Badge>)}
        </div>
      )}
      <button onClick={() => setShowAll((s) => !s)} className="mt-3 text-xs font-medium text-brand-600 hover:underline">
        {showAll ? "Hide" : "Show"} per-assistant results ({rs.length})
      </button>
      {showAll && <PerModel responses={rs} target={target} />}
    </div>
  );
}

function PerModel({ responses, target }: { responses: ModelResponse[]; target: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
      {responses.map((r) => {
        const s = targetStatus(r, target);
        return (
          <div key={r.id} className="px-3 py-2">
            <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="flex w-full items-center gap-2 text-left text-xs">
              <span className="flex-1 truncate font-medium">{r.modelName} <span className="font-normal text-slate-400">· {r.provider}</span></span>
              {r.error ? <Badge tone="amber">error</Badge> : <Badge tone={s.tone}>{s.label}</Badge>}
            </button>
            {expanded === r.id && (
              <p className={cx("mt-2 max-h-64 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs", r.error ? "text-amber-700" : "text-slate-600")}>
                {r.error ?? stripMd(r.text)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const stripMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "");
