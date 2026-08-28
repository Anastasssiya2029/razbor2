import { getDb } from "@/db";
import { analysisRuns, diagnostics } from "@/db/schema";
import {
  AppAuthError,
  canAccessOwnedAnalysis,
  requireAuthenticatedUser,
  type AuthenticatedAppUser,
} from "@/server/auth";
import { eq } from "drizzle-orm";

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
  request: Request,
  analysisRunId: string,
  options: { ownerOnly?: boolean } = {},
): Promise<AuthenticatedAppUser> {
  const actor = await requireAuthenticatedUser(request);
  const db = await getDb();
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

export function analysisRunAccessErrorResponse(error: unknown): Response | null {
  if (error instanceof AppAuthError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof AnalysisRunAccessError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  return null;
}
