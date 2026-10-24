// Contract between the pipeline runner and the two engines (live and demo).
import type {
  CompanyInput, CompetitorStat, ContentGap, Finding, GeneratedQuery, IntentStat, CitationSource,
  MetricSet, ModelInfo, ModelResponse, Recommendation, SiteProfile, StepId, StepStatus,
} from "../../shared/types.js";
import type { HistoryPoint } from "./impact.js";

export interface RunContext {
  id: string;
  input: CompanyInput;
  domain: string;
  step: (id: StepId, status: StepStatus, detail?: string) => void;
  log: (message: string) => void;
}

export type RawResponse = Omit<ModelResponse, "mentions" | "citations"> & { urls: string[] };

export interface Investigation {
  site: SiteProfile;
  queries: GeneratedQuery[];
  models: ModelInfo[];
  responses: RawResponse[];
  discoveredCompetitors: string[];
  /** Demo engine supplies synthetic history; live runs use previous runs for the same domain. */
  historyFor?: (current: MetricSet, competitorAvg: number) => HistoryPoint[];
}

export interface DiagnosisFacts {
  site: SiteProfile;
  queries: GeneratedQuery[];
  responses: ModelResponse[];
  competitors: CompetitorStat[];
  findings: Finding[];
  intentStats: IntentStat[];
  citationSources: CitationSource[];
}

export interface Diagnosis {
  goal: string;
  findings: Finding[]; // added on top of the rule-based findings
  contentGaps: ContentGap[];
  recommendations: Recommendation[];
}

export interface Engine {
  investigate(ctx: RunContext): Promise<Investigation>;
  diagnose(ctx: RunContext, facts: DiagnosisFacts): Promise<Diagnosis>;
}
