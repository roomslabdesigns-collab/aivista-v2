// Types shared between the API server and the React app.

export type Mode = "demo" | "live";

export interface CompanyInput {
  websiteUrl: string;
  companyName: string;
  industry: string;
  targetMarket: string;
  audience: string;
  competitors: string[];
  queryCount: number;
}

export type StepId =
  | "crawl"
  | "understand"
  | "audience"
  | "queries"
  | "testing"
  | "mentions"
  | "citations"
  | "diagnosis"
  | "recommend"
  | "impact";

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface StepState {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
}

export const PIPELINE_STEPS: { id: StepId; label: string }[] = [
  { id: "crawl", label: "Website analyzed" },
  { id: "understand", label: "Product category identified" },
  { id: "audience", label: "Target customers identified" },
  { id: "queries", label: "Generated high-intent customer queries" },
  { id: "testing", label: "Tested AI search visibility" },
  { id: "mentions", label: "Analyzed competitor mentions" },
  { id: "citations", label: "Investigated citation patterns" },
  { id: "diagnosis", label: "Diagnosed visibility gaps" },
  { id: "recommend", label: "Generated GEO recommendations" },
  { id: "impact", label: "Projected impact" },
];

export type AnalysisStatus = "queued" | "running" | "completed" | "failed";

export interface AnalysisSummary {
  id: string;
  companyName: string;
  domain: string;
  mode: Mode;
  status: AnalysisStatus;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface SiteProfile {
  pagesCrawled: number;
  pages: { url: string; title: string }[];
  summary: string;
  category: string;
  products: string[];
  features: string[];
  audiences: string[];
  pricing?: string;
  differentiators: string[];
}

export type QueryIntent = "high intent" | "comparison" | "alternative" | "informational";

export interface GeneratedQuery {
  id: string;
  text: string;
  intent: QueryIntent;
  persona?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  grounded: boolean;
}

export interface BrandMention {
  brand: string;
  position: number; // 1 = mentioned first among all brands in the answer
  recommended: boolean;
}

export type SourceType =
  | "review directory"
  | "comparison blog"
  | "vendor docs"
  | "industry roundup"
  | "forum"
  | "news"
  | "video"
  | "other";

export interface Citation {
  url?: string;
  domain: string;
  type: SourceType;
}

export interface ModelResponse {
  id: string;
  queryId: string;
  modelId: string;
  modelName: string;
  provider: string;
  text: string;
  mentions: BrandMention[];
  citations: Citation[];
  error?: string;
  latencyMs: number;
}

export interface CompetitorStat {
  name: string;
  isTarget: boolean;
  mentionRate: number; // 0..100
  citationRate: number;
  recommendationRate: number;
  avgPosition: number | null;
  gap: number | null; // mention rate difference vs target (percentage points)
}

export type Level = "high" | "medium" | "low";

export interface Finding {
  id: string;
  title: string;
  description: string;
  metric: string;
  severity: Level;
  evidenceQueryIds: string[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  impact: Level;
  confidence: number; // 0..100
  estimatedLift: number; // visibility percentage points
  actions: string[];
  targetQueryIds: string[];
}

export interface ContentGap {
  id: string;
  topic: string;
  description: string;
  competitorsCovering: string[];
  priority: Level;
}

export type ExperimentStatus = "proposed" | "approved" | "running" | "completed" | "rejected";

export interface Experiment {
  id: string;
  analysisId: string;
  recommendationId: string;
  title: string;
  hypothesis: string;
  metric: string;
  baseline: number;
  projected: number;
  durationWeeks: number;
  status: ExperimentStatus;
  createdAt: string;
}

export interface MetricSet {
  aiVisibility: number;
  mentionRate: number;
  citationCoverage: number;
  recommendationRate: number;
}

export interface Kpis extends MetricSet {
  deltas: MetricSet | null;
  sparklines: Record<keyof MetricSet, number[]>;
}

export interface TrendPoint {
  label: string;
  brand: number | null;
  competitorAvg: number | null;
  projected: number | null;
}

export interface CitationSource {
  domain: string;
  type: SourceType;
  count: number;
  /** % of the answers citing this source that mention each brand */
  brandShare: Record<string, number>;
}

export interface ModelStat {
  modelId: string;
  modelName: string;
  provider: string;
  mentionRate: number;
  recommendationRate: number;
  responses: number;
  errors: number;
}

export interface IntentStat {
  intent: QueryIntent;
  queries: number;
  mentionRate: number;
}

export interface Report {
  analysisId: string;
  company: CompanyInput;
  mode: Mode;
  createdAt: string;
  completedAt: string;
  durationMs: number;
  goal: string;
  site: SiteProfile;
  queries: GeneratedQuery[];
  models: ModelInfo[];
  responses: ModelResponse[];
  competitors: CompetitorStat[];
  discoveredCompetitors: string[];
  kpis: Kpis;
  findings: Finding[];
  recommendations: Recommendation[];
  contentGaps: ContentGap[];
  citationSources: CitationSource[];
  modelStats: ModelStat[];
  intentStats: IntentStat[];
  trend: TrendPoint[];
  actionIndex: number | null; // index in trend where the "action implemented" marker sits
  topOpportunity: { title: string; lift: number } | null;
  experiments: Experiment[];
}

export interface AnalysisDetail {
  summary: AnalysisSummary;
  input: CompanyInput;
  steps: StepState[];
  report: Report | null;
}

export interface AppConfig {
  geminiReady: boolean;
  liveReady: boolean;
  jsRendering: boolean;
  providers: { id: string; name: string; configured: boolean }[];
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  /** false when the server runs without login (REQUIRE_LOGIN unset): there is no sign-out then. */
  authRequired: boolean;
}

export type Frequency = "daily" | "weekly" | "monthly";

export interface Schedule {
  id: string;
  companyName: string;
  domain: string;
  input: CompanyInput;
  mode: Mode;
  frequency: Frequency;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastAnalysisId?: string;
  lastError?: string;
  createdAt: string;
  /** Mention rate of each completed run started by this schedule, oldest first. */
  history: { analysisId: string; date: string; mentionRate: number; aiVisibility: number }[];
}

export type AnalysisEvent =
  | { type: "steps"; steps: StepState[] }
  | { type: "status"; status: AnalysisStatus; error?: string }
  | { type: "log"; message: string };
