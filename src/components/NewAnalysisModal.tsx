import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, Diamond, Loader2, Sparkles, X } from "lucide-react";
import type { CompanyInput, Mode } from "../../shared/types";
import { api } from "../api";
import { useApp } from "../state";
import { cx } from "./ui";

const EMPTY = { websiteUrl: "", companyName: "", industry: "", targetMarket: "", audience: "", competitors: "" };
const DEPTHS = [
  { n: 10, label: "Quick scan", hint: "10 queries" },
  { n: 20, label: "Standard", hint: "20 queries" },
  { n: 30, label: "Deep", hint: "30 queries" },
];

export function NewAnalysisModal() {
  const { setModalOpen, launch, config } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [queryCount, setQueryCount] = useState(10);
  const [mode, setMode] = useState<Mode>(config?.liveReady ? "live" : "demo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const close = () => setModalOpen(false);

  async function fillSample() {
    const s = await api.sample();
    setForm({ ...s, competitors: s.competitors.join(", ") });
    setQueryCount(20);
    setMode("demo");
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.websiteUrl.trim()) return setError("Please enter a website URL for the brand.");
    if (!form.companyName.trim()) return setError("Please enter the company or brand name.");
    const input: CompanyInput = { ...form, competitors: form.competitors.split(",").map((c) => c.trim()).filter(Boolean), queryCount };
    setBusy(true);
    try {
      await launch(input, mode);
      close();
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
          <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Diamond className="size-4" /></div>
          <div className="flex-1">
            <h2 className="font-semibold">Launch New Analysis</h2>
            <p className="text-[13px] text-slate-500">Configure target domain and create an active investigation run.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div className="scroll-thin space-y-4 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">
              <AlertTriangle className="size-4 shrink-0" />{error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Project configuration</span>
            <button type="button" onClick={fillSample} className="text-[13px] text-brand-600 hover:underline">Fill with Relay CRM sample</button>
          </div>

          <Field label="Website URL" required><input value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="e.g. https://relay.io or mycompany.com" className={inputCls} /></Field>
          <Field label="Company / Brand Name" required><input value={form.companyName} onChange={set("companyName")} placeholder="e.g. Relay CRM" className={inputCls} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry"><input value={form.industry} onChange={set("industry")} placeholder="SaaS / CRM" className={inputCls} /></Field>
            <Field label="Target Market"><input value={form.targetMarket} onChange={set("targetMarket")} placeholder="North America & Europe" className={inputCls} /></Field>
          </div>
          <Field label="Target Audience (ICP)"><input value={form.audience} onChange={set("audience")} placeholder="Mid-market RevOps & Sales Directors" className={inputCls} /></Field>
          <Field label="Competitors (comma separated)"><input value={form.competitors} onChange={set("competitors")} placeholder="HubSpot, Salesforce, Pipedrive" className={inputCls} /></Field>

          <Field label="Investigation depth">
            <div className="grid grid-cols-3 gap-2">
              {DEPTHS.map((d) => (
                <button key={d.n} type="button" onClick={() => setQueryCount(d.n)}
                  className={cx("rounded-xl px-3 py-2 text-left ring-1 transition", queryCount === d.n ? "bg-brand-50 ring-brand-500" : "ring-slate-200 hover:bg-slate-50")}>
                  <div className="text-[13px] font-medium">{d.label}</div>
                  <div className="text-[11px] text-slate-500">{d.hint}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Data source">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton active={mode === "demo"} onClick={() => setMode("demo")} title="Demo" hint="Simulated results, no API keys" />
              <ModeButton active={mode === "live"} onClick={() => config?.liveReady && setMode("live")} disabled={!config?.liveReady}
                title="Live" hint={config?.liveReady ? "Real crawl + free LLM APIs" : "Add API keys to .env to enable"} />
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={close} className="rounded-xl px-4 py-2 text-sm ring-1 ring-slate-200 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Start Investigation
          </button>
        </div>
      </motion.form>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-800">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}

function ModeButton({ active, onClick, title, hint, disabled }: { active: boolean; onClick: () => void; title: string; hint: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cx("rounded-xl px-3 py-2 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-50", active ? "bg-brand-50 ring-brand-500" : "ring-slate-200 hover:bg-slate-50")}>
      <div className="text-[13px] font-medium">{title}</div>
      <div className="text-[11px] text-slate-500">{hint}</div>
    </button>
  );
}
