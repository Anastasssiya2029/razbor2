import { doublePrecision, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cabinetSchema } from "./enums";
import { analysisRunsTable } from "./analysis-runs";

// One row per actual outbound request to the AI provider (OpenRouter),
// including every retried/failed attempt -- this is the only place real,
// per-attempt cost/latency/error data lives. The per-module result tables
// (p0X_analysis_results) only store the *last* attempt's aggregated usage,
// which is not enough to show an architect an accurate "what actually
// happened, call by call" cost/time breakdown for a run.
export const aiCallLogTable = cabinetSchema.table("ai_call_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: a situation-summary call happens while the client is still
  // filling in the form, before any diagnostic/analysis run exists. Such
  // rows are logged with situationSessionId instead and get backfilled with
  // an analysisRunId once (if) the client actually submits the diagnostic --
  // see reconcileSituationSummaryCallLogs in domain/diagnostic/repository.
  analysisRunId: uuid("analysis_run_id").references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  // Stable per-form-session id the frontend generates before an
  // analysisRunId exists, only ever set on rows with a null analysisRunId.
  situationSessionId: text("situation_session_id"),
  module: text("module").notNull(), // "p01" | "p02" | "p03" | "p04" | "situation_summary"
  attemptIndex: integer("attempt_index").notNull(), // 1-based, per (analysisRunId, module)
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(), // "success" | "error"
  httpStatus: integer("http_status"),
  errorCode: text("error_code"),
  // Sanitized: never the raw upstream/provider message, never prompt or
  // response content. See ai/call-log.ts sanitizeErrorMessage().
  errorMessage: text("error_message"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  costUsd: doublePrecision("cost_usd"),
  latencyMs: integer("latency_ms").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiCallLogSchema = createInsertSchema(aiCallLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAiCallLog = z.infer<typeof insertAiCallLogSchema>;
export type AiCallLog = typeof aiCallLogTable.$inferSelect;
