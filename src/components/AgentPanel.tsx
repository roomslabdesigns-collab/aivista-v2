import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import { motion } from "motion/react";
import type { StepState } from "../../shared/types";
import { useApp } from "../state";
import { ProgressRing, cx } from "./ui";

export function AgentPanel() {
  const { steps, detail, report, running } = useApp();
  const done = steps.filter((s) => s.status === "done").length;
  const status = detail?.summary.status;
  const subtitle =
    status === "running" ? "Investigating · tools running" :
    status === "failed" ? "Investigation failed" :
    status === "completed" ? "Investigation closed · awaiting your approval" : "Idle";
  const goal = report?.goal ??
    (detail ? `Investigate why ${detail.summary.companyName} is underperforming in AI search recommendations — and why competitors are recommended instead.` : "Launch an analysis to start the agent.");

  return (
    <div className="flex h-full flex-col rounded-2xl bg-navy-900 p-6 text-slate-300 shadow-xl shadow-navy-900/20">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
          <img src="/logo.svg" alt="" className="size-6" />
        </div>
        <div>
          <div className="font-semibold text-white">Vista Revenue Agent</div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {running && <span className="size-1.5 animate-pulse rounded-full bg-brand-500" />}{subtitle}
          </div>
        </div>
      </div>

      <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-500">Current goal</div>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-white">{goal}</p>

      <div className="mt-4 flex items-center gap-3 text-[13px]">
        <ProgressRing value={steps.length ? (done / steps.length) * 100 : 0} />
        <span>{done} of {steps.length} steps · {status === "completed" ? "all tools returned" : status === "failed" ? "stopped" : "in progress"}</span>
      </div>
      {status === "failed" && detail?.summary.error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/20">{detail.summary.error}</p>
      )}

      <div className="mt-6 border-t border-white/10 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Investigation timeline</div>
      <ol className="scroll-thin mt-3 flex-1 space-y-3.5 overflow-y-auto pr-1">
        {steps.map((s, i) => <TimelineStep key={s.id} step={s} index={i} />)}
      </ol>
    </div>
  );
}

function TimelineStep({ step, index }: { step: StepState; index: number }) {
  const Icon = { done: CheckCircle2, running: Loader2, pending: Circle, error: XCircle, skipped: MinusCircle }[step.status];
  return (
    <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }} className="flex gap-3">
      <Icon className={cx("mt-0.5 size-4 shrink-0",
        step.status === "done" && "text-emerald-400",
        step.status === "running" && "animate-spin text-brand-500",
        step.status === "pending" && "text-slate-600",
        step.status === "error" && "text-red-400",
        step.status === "skipped" && "text-slate-500")} />
      <div className="min-w-0">
        <div className={cx("text-[13px] font-medium", step.status === "pending" ? "text-slate-500" : "text-white")}>{step.label}</div>
        {step.detail && <div className="truncate text-xs text-slate-400">{step.detail}</div>}
      </div>
    </motion.li>
  );
}
