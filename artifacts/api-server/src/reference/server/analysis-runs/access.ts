import {
  analysisRunsTable as analysisRuns,
  db,
  diagnosticsTable as diagnostics,
} from "@workspace/db";
import { canAccessOwnedAnalysis } from "../../../domain/auth/policy";
import type { AuthenticatedAppUser } from "../../../domain/auth/types";
import { eq } from "drizzle-orm";

// NOTE: adapted for Express. The reference version derived `actor` from a
// Next.js Request via requireAuthenticatedUser(); here the caller has already
// authenticated the request via the `requireAuth` Express middleware and
// passes the resolved actor in directly.
export class AnalysisRunAccessError extends Error {
  constructor(
    readonly code: "ANALYSIS_RUN_NOT_FOUND" | "ANALYSIS_RUN_FORBIDDEN",
    readonly status: 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisRunAccessError";
  }
}

export async function requireAnalysisRunAccess(
  actor: AuthenticatedAppUser,
  analysisRunId: string,
  options: { ownerOnly?: boolean } = {},
): Promise<AuthenticatedAppUser> {
  const rows = await db
    .select({ ownerUserId: diagnostics.ownerUserId })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  const run = rows[0];
  if (!run) throw new AnalysisRunAccessError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
  const allowed = options.ownerOnly
    ? Boolean(run.ownerUserId) && run.ownerUserId === actor.id
    : canAccessOwnedAnalysis(actor.role, actor.id, run.ownerUserId);
  if (!allowed) throw new AnalysisRunAccessError("ANALYSIS_RUN_FORBIDDEN", 403, "Нет доступа к разбору.");
  return actor;
}
