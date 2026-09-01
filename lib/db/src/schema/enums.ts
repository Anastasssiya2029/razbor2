import { pgSchema } from "drizzle-orm/pg-core";

// This app's tables live in their own Postgres schema ("cabinet") rather than
// "public" because the underlying database is shared with another,
// unrelated application (a school payment/scheduling tracker) that already
// owns tables like "clients" and "profiles" in "public". Keeping everything
// under "cabinet" avoids any name collision or accidental cross-app writes.
export const cabinetSchema = pgSchema("cabinet");

// Roles mirror the reference architecture's hierarchy:
// architect (full control incl. role changes) > admin (can invite managers/admins) > manager (owns own clients/diagnostics only).
export const appRoleEnum = cabinetSchema.enum("app_role", ["architect", "admin", "manager"]);

export const appUserStatusEnum = cabinetSchema.enum("app_user_status", [
  "invited",
  "active",
  "disabled",
]);

export const appInviteStatusEnum = cabinetSchema.enum("app_invite_status", [
  "pending",
  "accepted",
  "revoked",
]);

// Sequential pipeline stages. A run only ever moves forward; "analysis_failed"
// is a terminal state reachable from any stage when a deterministic guard or
// an AI stage exhausts its retry budget.
export const analysisRunStatusEnum = cabinetSchema.enum("analysis_run_status", [
  "draft", // diagnostic input saved but not yet submitted for analysis
  "queued", // submitted; pipeline has not started P-01 yet
  "scoring", // P-01 in flight
  "targeting", // deterministic Target Configuration + Business Archetype
  "strategizing", // P-02 in flight
  "resolving_tasks", // deterministic Task Resolver (Matrix 70)
  "money_now", // deterministic Money Now Selector
  "money_now_prescribing", // P-03 in flight (only when a scenario was selected)
  "writing_report", // P-04 in flight
  "ready", // analysis-result.v1 assembled and immutable
  "analysis_failed",
]);

export const moneyNowSelectionStatusEnum = cabinetSchema.enum("money_now_selection_status", [
  "selected",
  "no_eligible_scenario",
]);

export const p03StatusEnum = cabinetSchema.enum("p03_status", [
  "prescribed",
  "skipped_no_scenario",
]);

// A client can draw a gift once per tariff -- "self" (Самостоятельный) and
// "support" (Сопровождение) are independent, so both may be won within the
// same analysis result.
export const giftTariffEnum = cabinetSchema.enum("gift_tariff", ["self", "support"]);
