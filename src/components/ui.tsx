import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { Level, ModelResponse, QueryIntent } from "../../shared/types";
import { useApp } from "../state";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, count }: { title: string; subtitle?: string; action?: ReactNode; count?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">
          {title}
          {count && <span className="ml-2 text-xs font-normal text-slate-400">{count}</span>}
        </h2>
        {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const TONES = {
  red: "bg-red-50 text-red-600 ring-red-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

export const levelTone = (l: Level): Tone => (l === "high" ? "red" : l === "medium" ? "amber" : "slate");
export const intentTone = (i: QueryIntent): Tone =>
  i === "high intent" ? "red" : i === "comparison" ? "blue" : i === "alternative" ? "violet" : "slate";

export function Button({
  children, onClick, variant = "primary", className, disabled, type = "button",
}: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "dark"; className?: string; disabled?: boolean; type?: "button" | "submit" }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/30",
    secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
    ghost: "text-brand-600 hover:bg-brand-50",
    dark: "bg-white text-navy-900 hover:bg-slate-100",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cx("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50", styles[variant], className)}>
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3b82f6" strokeWidth={4} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="transition-all duration-500" />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className="rotate-90 fill-white text-[10px] font-semibold" style={{ transformOrigin: "center" }}>
        {Math.round(value)}%
      </text>
    </svg>
  );
}

export function Meter({ value, color = "bg-brand-600" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cx("h-full rounded-full", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Wraps a page that needs a finished report: shows progress or empty states otherwise. */
export function RequireReport({ children }: { children: (r: NonNullable<ReturnType<typeof useApp>["report"]>) => ReactNode }) {
  const { report, running, detail, currentId, setModalOpen, showDemo } = useApp();
  if (report) return <>{children(report)}</>;
  if (running)
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-16 text-center">
        <Loader2 className="size-6 animate-spin text-brand-600" />
        <p className="font-medium">The agent is investigating {detail?.summary.companyName}…</p>
        <p className="text-sm text-slate-500">Results appear here when the run completes. Follow progress on the Overview page.</p>
      </Card>
    );
  if (detail?.summary.status === "failed")
    return (
      <Card className="p-10 text-center">
        <p className="font-medium text-red-600">This analysis failed</p>
        <p className="mt-2 text-sm text-slate-500">{detail.summary.error}</p>
        <Button className="mt-5" onClick={() => setModalOpen(true)}>Launch a new analysis</Button>
      </Card>
    );
  if (currentId)
    return (
      <Card className="flex justify-center p-12">
        <Loader2 className="size-5 animate-spin text-brand-600" />
      </Card>
    );
  return (
    <Card className="p-12 text-center">
      <p className="font-medium">No analysis open</p>
      <p className="mt-1 text-sm text-slate-500">Launch a new analysis, load the demo data, or open a past analysis from the sidebar.</p>
      <div className="mt-5 flex justify-center gap-3">
        <Button variant="secondary" onClick={() => void showDemo()}>Load demo data</Button>
        <Button onClick={() => setModalOpen(true)}>New Analysis</Button>
      </div>
    </Card>
  );
}

/** How the target brand did in one response. */
export function targetStatus(r: ModelResponse | undefined, target: string) {
  const m = r?.mentions.find((x) => x.brand === target);
  if (!m) return { label: "absent", tone: "red" as Tone };
  if (m.position === 1) return { label: "position #1", tone: "green" as Tone };
  return { label: `mentioned #${m.position}`, tone: "blue" as Tone };
}
