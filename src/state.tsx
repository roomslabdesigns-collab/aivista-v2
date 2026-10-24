import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AnalysisDetail, AnalysisSummary, AppConfig, CompanyInput, Mode, Report, StepState } from "../shared/types";
import { api } from "./api";

interface AppState {
  config: AppConfig | null;
  analyses: AnalysisSummary[];
  currentId: string | null;
  detail: AnalysisDetail | null;
  steps: StepState[];
  report: Report | null;
  running: boolean;
  select: (id: string) => void;
  launch: (input: CompanyInput, mode: Mode) => Promise<void>;
  /** Opens the most recent demo analysis, creating one first if none exists. */
  showDemo: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  reloadList: () => Promise<unknown>;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  search: string;
  setSearch: (s: string) => void;
}

const Ctx = createContext<AppState | null>(null);

const STORAGE_KEY = "aivista.currentAnalysis";
const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(readStored());
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const refreshList = useCallback(async () => {
    const list = await api.list();
    setAnalyses(list);
    return list;
  }, []);

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
    refreshList().then((list) => {
      setCurrentId((cur) => (cur && list.some((a) => a.id === cur) ? cur : (list.find((a) => a.status === "completed") ?? list[0])?.id ?? null));
    });
  }, [refreshList]);

  const loadDetail = useCallback(async (id: string) => {
    const d = await api.get(id);
    setDetail(d);
    setSteps(d.steps);
    return d;
  }, []);

  // Load the selected analysis and follow its live progress.
  useEffect(() => {
    if (!currentId) return;
    try {
      localStorage.setItem(STORAGE_KEY, currentId);
    } catch {
      /* storage unavailable */
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    loadDetail(currentId).then((d) => {
      if (cancelled || d.summary.status !== "running") return;
      stop = api.events(currentId, (e) => {
        if (e.type === "steps") setSteps(e.steps);
        if (e.type === "status" && e.status !== "running") {
          void loadDetail(currentId);
          void refreshList();
        }
      });
    }).catch(() => setDetail(null));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [currentId, loadDetail, refreshList]);

  const launch = useCallback(async (input: CompanyInput, mode: Mode) => {
    const { id } = await api.create(input, mode);
    await refreshList();
    setCurrentId(id);
  }, [refreshList]);

  const showDemo = useCallback(async () => {
    const list = await refreshList();
    const existing = list.find((a) => a.mode === "demo" && a.status === "completed");
    if (existing) {
      setCurrentId(existing.id);
      return;
    }
    const sample = await api.sample();
    await launch(sample, "demo");
  }, [refreshList, launch]);

  const remove = useCallback(async (id: string) => {
    await api.remove(id);
    const list = await refreshList();
    if (id === currentId) setCurrentId(list[0]?.id ?? null);
  }, [currentId, refreshList]);

  const value = useMemo<AppState>(() => ({
    config,
    analyses,
    currentId,
    detail,
    steps,
    report: detail?.report ?? null,
    running: detail?.summary.status === "running",
    select: setCurrentId,
    launch,
    showDemo,
    remove,
    reload: async () => {
      if (currentId) await loadDetail(currentId);
    },
    reloadList: refreshList,
    modalOpen,
    setModalOpen,
    search,
    setSearch,
  }), [config, analyses, currentId, detail, steps, launch, showDemo, remove, loadDetail, refreshList, modalOpen, search]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}
