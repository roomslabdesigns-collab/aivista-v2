import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell, CalendarClock, ChevronDown, ChevronsLeft, FileText, FlaskConical, Home, Layers, Lightbulb, Link2, LogOut, Menu,
  MessagesSquare, Plus, Search, Sparkles, Swords,
} from "lucide-react";
import { useAuth } from "../auth";
import { useApp } from "../state";
import { Badge, cx } from "./ui";
import { NewAnalysisModal } from "./NewAnalysisModal";

const NAV = [
  { section: "Main", items: [
    { to: "/", label: "Overview", icon: Home },
    { to: "/analysis", label: "AI Search Analysis", icon: Search },
    { to: "/competitors", label: "Competitors", icon: Swords },
    { to: "/opportunities", label: "Opportunities", icon: Sparkles },
    { to: "/queries", label: "Queries", icon: MessagesSquare },
    { to: "/experiments", label: "Experiments", icon: FlaskConical },
  ] },
  { section: "Intelligence", items: [
    { to: "/insights", label: "Visibility Insights", icon: Lightbulb },
    { to: "/citations", label: "Citation Intelligence", icon: Link2 },
    { to: "/gaps", label: "Content Gaps", icon: Layers },
    { to: "/monitoring", label: "Monitoring", icon: CalendarClock },
    { to: "/reports", label: "Reports", icon: FileText },
  ] },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { modalOpen } = useApp();

  return (
    <div className="flex h-full">
      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={cx(
        "fixed inset-y-0 left-0 z-40 flex flex-col bg-navy-900 text-slate-300 transition-all lg:static",
        collapsed ? "w-[76px]" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}>
        <div className="flex items-center gap-3 px-5 pb-6 pt-5">
          <img src="/logo.svg" alt="" className="size-8 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-white">AIVista</div>
              <div className="text-[11px] text-slate-400">AI Search Revenue Agent</div>
            </div>
          )}
          <button onClick={() => setCollapsed((c) => !c)} className="hidden rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300 lg:block" aria-label="Collapse sidebar">
            <ChevronsLeft className={cx("size-4 transition", collapsed && "rotate-180")} />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3">
          {NAV.map((group) => (
            <div key={group.section}>
              {!collapsed && <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.section}</div>}
              <ul className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === "/"} onClick={() => setMobileOpen(false)} title={collapsed ? label : undefined}
                      className={({ isActive }) => cx(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition",
                        isActive ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white",
                        collapsed && "justify-center",
                      )}>
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {!collapsed && <RunPicker />}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="scroll-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
      {modalOpen && <NewAnalysisModal />}
    </div>
  );
}

function RunPicker() {
  const { analyses, currentId, select } = useApp();
  if (!analyses.length) return null;
  return (
    <div className="border-t border-white/5 p-3">
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Analysis</div>
      <div className="relative">
        <select value={currentId ?? ""} onChange={(e) => select(e.target.value)}
          className="w-full appearance-none rounded-xl bg-white/5 px-3 py-2 pr-8 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-brand-500">
          {analyses.map((a) => (
            <option key={a.id} value={a.id} className="text-slate-900">
              {a.companyName} · {new Date(a.createdAt).toLocaleDateString()} · {a.mode}{a.status !== "completed" ? ` (${a.status})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-slate-400" />
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { setModalOpen, search, setSearch, running, detail } = useApp();
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur sm:px-8">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <div className="relative max-w-xl flex-1">
        <Search className="absolute left-3.5 top-2.5 size-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && navigate("/queries")}
          placeholder="Search queries, competitors, insights…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </div>
      <div className="ml-auto flex items-center gap-3">
        {running && <Badge tone="blue" className="hidden sm:inline-flex"><span className="size-1.5 animate-pulse rounded-full bg-brand-600" />Investigating {detail?.summary.companyName}</Badge>}
        {detail && <Badge tone={detail.summary.mode === "live" ? "green" : "amber"} className="hidden md:inline-flex">{detail.summary.mode === "live" ? "Live data" : "Demo data"}</Badge>}
        <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700">
          <Plus className="size-4" /><span className="hidden sm:inline">New Analysis</span>
        </button>
        <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
          <Bell className="size-5" />
          {running && <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500" />}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = user.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  if (!user.authRequired)
    return (
      <div className="grid size-9 place-items-center rounded-full bg-navy-900" title="AIVista">
        <img src="/logo.svg" alt="" className="size-5" />
      </div>
    );
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-slate-100">
        <div className="grid size-9 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{initials}</div>
        <div className="hidden text-left leading-tight sm:block">
          <div className="text-[13px] font-medium">{user.name}</div>
          <div className="max-w-40 truncate text-[11px] text-slate-500">{user.workspaceName}</div>
        </div>
        <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <div className="px-3 py-2">
              <div className="truncate text-[13px] font-medium">{user.name}</div>
              <div className="truncate text-xs text-slate-500">{user.email}</div>
            </div>
            <div className="my-1 border-t border-slate-100" />
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50">
              <LogOut className="size-4" />Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
