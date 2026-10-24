import type {
  AnalysisDetail, AnalysisEvent, AnalysisSummary, AppConfig, CompanyInput, Experiment, ExperimentStatus, Frequency, Mode,
  Schedule, SessionUser,
} from "../shared/types";

/** Called when the session expires mid-use, so the app can show the sign-in screen. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (res.status === 401 && !url.startsWith("/api/auth/")) onUnauthorized();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  me: () => req<SessionUser>("/api/auth/me"),
  login: (email: string, password: string) =>
    req<SessionUser>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (body: { name: string; email: string; password: string; workspaceName: string }) =>
    req<SessionUser>("/api/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  logout: () => req<void>("/api/auth/logout", { method: "POST" }),
  schedules: () => req<Schedule[]>("/api/schedules"),
  createSchedule: (input: CompanyInput, mode: Mode, frequency: Frequency) =>
    req<{ id: string }>("/api/schedules", { method: "POST", body: JSON.stringify({ input, mode, frequency }) }),
  updateSchedule: (id: string, patch: { enabled?: boolean; frequency?: Frequency }) =>
    req<Schedule>(`/api/schedules/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  runSchedule: (id: string) => req<{ id: string }>(`/api/schedules/${id}/run`, { method: "POST" }),
  deleteSchedule: (id: string) => req<void>(`/api/schedules/${id}`, { method: "DELETE" }),
  config: () => req<AppConfig>("/api/config"),
  sample: () => req<CompanyInput>("/api/sample"),
  list: () => req<AnalysisSummary[]>("/api/analyses"),
  get: (id: string) => req<AnalysisDetail>(`/api/analyses/${id}`),
  create: (input: CompanyInput, mode: Mode) =>
    req<{ id: string }>("/api/analyses", { method: "POST", body: JSON.stringify({ input, mode }) }),
  remove: (id: string) => req<void>(`/api/analyses/${id}`, { method: "DELETE" }),
  setExperiment: (id: string, status: ExperimentStatus) =>
    req<Experiment>(`/api/experiments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  events: (id: string, onEvent: (e: AnalysisEvent) => void) => {
    const es = new EventSource(`/api/analyses/${id}/events`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as AnalysisEvent;
      // The server closes the stream once a run finishes; stop EventSource from reconnecting.
      if (e.type === "status" && e.status !== "running") es.close();
      onEvent(e);
    };
    return () => es.close();
  },
};
