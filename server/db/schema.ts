import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  workspaceId: text("workspace_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(), // sha256 of the cookie value
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  companyName: text("company_name").notNull(),
  domain: text("domain").notNull(),
  input: text("input").notNull(), // JSON CompanyInput
  mode: text("mode").notNull(),
  frequency: text("frequency").notNull(), // daily | weekly | monthly
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  nextRunAt: text("next_run_at").notNull(),
  lastRunAt: text("last_run_at"),
  lastAnalysisId: text("last_analysis_id"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
});

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  scheduleId: text("schedule_id"),
  companyName: text("company_name").notNull(),
  domain: text("domain").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  input: text("input").notNull(), // JSON CompanyInput
  steps: text("steps").notNull(), // JSON StepState[]
  report: text("report"), // JSON Report (without responses / experiments)
  error: text("error"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id").notNull(),
  queryId: text("query_id").notNull(),
  modelId: text("model_id").notNull(),
  modelName: text("model_name").notNull(),
  provider: text("provider").notNull(),
  text: text("text").notNull(),
  mentions: text("mentions").notNull(), // JSON BrandMention[]
  citations: text("citations").notNull(), // JSON Citation[]
  error: text("error"),
  latencyMs: integer("latency_ms").notNull(),
});

export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id").notNull(),
  recommendationId: text("recommendation_id").notNull(),
  title: text("title").notNull(),
  hypothesis: text("hypothesis").notNull(),
  metric: text("metric").notNull(),
  baseline: real("baseline").notNull(),
  projected: real("projected").notNull(),
  durationWeeks: integer("duration_weeks").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const bootstrapSql = [
  `CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY, company_name TEXT NOT NULL, domain TEXT NOT NULL, mode TEXT NOT NULL,
    status TEXT NOT NULL, input TEXT NOT NULL, steps TEXT NOT NULL, report TEXT, error TEXT,
    created_at TEXT NOT NULL, completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, query_id TEXT NOT NULL, model_id TEXT NOT NULL,
    model_name TEXT NOT NULL, provider TEXT NOT NULL, text TEXT NOT NULL, mentions TEXT NOT NULL,
    citations TEXT NOT NULL, error TEXT, latency_ms INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS responses_analysis ON responses(analysis_id)`,
  `CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, recommendation_id TEXT NOT NULL, title TEXT NOT NULL,
    hypothesis TEXT NOT NULL, metric TEXT NOT NULL, baseline REAL NOT NULL, projected REAL NOT NULL,
    duration_weeks INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS experiments_analysis ON experiments(analysis_id)`,
  `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
    workspace_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, company_name TEXT NOT NULL, domain TEXT NOT NULL, input TEXT NOT NULL,
    mode TEXT NOT NULL, frequency TEXT NOT NULL, enabled INTEGER NOT NULL, next_run_at TEXT NOT NULL, last_run_at TEXT,
    last_analysis_id TEXT, last_error TEXT, created_at TEXT NOT NULL)`,
];

/** Columns added after the first release; applied when missing. */
export const addedColumns: { table: string; column: string; ddl: string }[] = [
  { table: "analyses", column: "workspace_id", ddl: "ALTER TABLE analyses ADD COLUMN workspace_id TEXT" },
  { table: "analyses", column: "schedule_id", ddl: "ALTER TABLE analyses ADD COLUMN schedule_id TEXT" },
];
