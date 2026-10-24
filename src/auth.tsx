import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { SessionUser } from "../shared/types";
import { api, setUnauthorizedHandler } from "./api";
import { cx } from "./components/ui";

interface AuthState {
  user: SessionUser;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthGate");
  return v;
}

/** Renders children only for a signed-in user; otherwise shows the sign-in / sign-up screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined)
    return <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin text-brand-600" /></div>;
  if (!user) return <AuthPage onAuthed={setUser} />;

  const logout = async () => {
    await api.logout();
    setUser(null);
  };
  // key: remount the app (and its cached data) when a different user signs in
  return <Ctx.Provider value={{ user, logout }}><div key={user.id} className="h-full">{children}</div></Ctx.Provider>;
}

function AuthPage({ onAuthed }: { onAuthed: (u: SessionUser) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", workspaceName: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAuthed(mode === "login" ? await api.login(form.email, form.password) : await api.signup(form));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 p-12 text-slate-300 lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="size-9" />
          <div>
            <div className="font-semibold text-white">AIVista</div>
            <div className="text-xs text-slate-400">AI Search Revenue Agent</div>
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-white">Find out why AI assistants recommend your competitors — and fix it.</h1>
          <ol className="mt-8 space-y-3 text-sm">
            {["Investigate your website", "Generate real customer questions", "Test them across 20+ AI assistants", "Diagnose the gaps & get GEO recommendations", "Run experiments and measure impact"].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </div>
        <div className="text-xs text-slate-500">Runs on free AI APIs · demo mode needs no keys</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <img src="/logo.svg" alt="" className="mb-6 size-10 lg:hidden" />
          <h2 className="text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-sm text-slate-500">{mode === "login" ? "Sign in to your workspace." : "You'll get a workspace with a demo analysis to explore."}</p>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                className={cx("rounded-lg py-1.5 font-medium", mode === m ? "bg-white shadow-sm" : "text-slate-500")}>
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-600">
              <AlertTriangle className="size-4 shrink-0" />{error}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {mode === "signup" && (
              <>
                <Input label="Your name" value={form.name} onChange={set("name")} autoComplete="name" required />
                <Input label="Workspace name" value={form.workspaceName} onChange={set("workspaceName")} placeholder="e.g. Acme Growth Team" />
              </>
            )}
            <Input label="Email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
            <Input label="Password" type="password" value={form.password} onChange={set("password")}
              autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} required
              hint={mode === "signup" ? "At least 8 characters" : undefined} />
          </div>
          <button type="submit" disabled={busy}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />}{mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Input({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium">{label}</span>
      <input {...props} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
