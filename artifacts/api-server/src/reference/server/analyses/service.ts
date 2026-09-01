import {
  analysisGiftsTable as analysisGifts,
  analysisResultsTable as analysisResults,
  analysisRunsTable as analysisRuns,
  appUsersTable as appUsers,
  clientsTable as clients,
  db,
  diagnosticsTable as diagnostics,
} from "@workspace/db";
import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { BUSINESS_ARCHETYPE_BY_ID, type BusinessArchetypeId } from "@/server/7k/config/archetypes.v2";
import type { SevenKScores } from "@/server/7k/types";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import { canViewAllAnalyses } from "../../../domain/auth/policy";
import type { AuthenticatedAppUser } from "../../../domain/auth/types";
import { desc, eq } from "drizzle-orm";

export type AnalysisListItem = {
  analysisRunId: string;
  diagnosticId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  client: { id: string | null; name: string; niche: string | null };
  manager: { id: string | null; name: string };
  currentRevenueRub: number | null;
  targetRevenueRub: number | null;
  currentTotalScore: number | null;
  targetTotalScore: number | null;
  archetype: { id: BusinessArchetypeId; name: string } | null;
  resultReady: boolean;
  gift: string | null;
};

export type AnalysisCoverContext = {
  currentRevenueRub: number | null;
  targetRevenueRub: number | null;
  deadlineMonths: number | null;
};

function scoreTotal(scores: SevenKScores): number {
  return Object.values(scores).reduce((total, score) => total + score, 0);
}

function safeParse<T>(source: unknown): T | null {
  return source ? source as T : null;
}

export async function listAnalyses(actor: AuthenticatedAppUser): Promise<AnalysisListItem[]> {
  const base = db
    .select({
      analysisRunId: analysisRuns.id,
      diagnosticId: diagnostics.id,
      createdAt: analysisRuns.createdAt,
      updatedAt: analysisRuns.updatedAt,
      status: analysisRuns.status,
      normalizedInput: diagnostics.normalizedInput,
      clientId: clients.id,
      clientName: clients.displayName,
      niche: clients.niche,
      managerId: appUsers.id,
      managerName: appUsers.displayName,
      result: analysisResults.result,
      gift: analysisGifts.giftLabel,
    })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .leftJoin(clients, eq(diagnostics.clientId, clients.id))
    .leftJoin(appUsers, eq(diagnostics.ownerUserId, appUsers.id))
    .leftJoin(analysisResults, eq(analysisResults.analysisRunId, analysisRuns.id))
    .leftJoin(analysisGifts, eq(analysisGifts.analysisResultId, analysisResults.id));
  const rows = canViewAllAnalyses(actor.role)
    ? await base.orderBy(desc(analysisRuns.createdAt)).limit(500)
    : await base.where(eq(diagnostics.ownerUserId, actor.id)).orderBy(desc(analysisRuns.createdAt)).limit(500);

  return rows.map((row) => {
    const input = safeParse<DiagnosticInputV1_2>(row.normalizedInput);
    const result = safeParse<AnalysisResultV1>(row.result);
    const archetypeId = result?.archetype.finalArchetype;
    return {
      analysisRunId: row.analysisRunId,
      diagnosticId: row.diagnosticId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      status: row.status,
      client: {
        id: row.clientId,
        name: row.clientName ?? input?.identity.expertName ?? "Без имени",
        niche: row.niche ?? input?.identity.niche ?? null,
      },
      manager: { id: row.managerId, name: row.managerName ?? "Не назначен" },
      currentRevenueRub: input?.current.monthlyRevenueRub ?? null,
      targetRevenueRub: input?.target.monthlyRevenueRub ?? null,
      currentTotalScore: result ? scoreTotal(result.current.scores) : null,
      targetTotalScore: result ? scoreTotal(result.target.targetScores) : null,
      archetype: archetypeId
        ? { id: archetypeId, name: BUSINESS_ARCHETYPE_BY_ID[archetypeId].name }
        : null,
      resultReady: Boolean(result),
      gift: row.gift,
    };
  });
}

export async function getAnalysisCoverContext(analysisRunId: string): Promise<AnalysisCoverContext | null> {
  const rows = await db
    .select({ normalizedInput: diagnostics.normalizedInput })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  const input = safeParse<DiagnosticInputV1_2>(rows[0]?.normalizedInput);
  return input ? {
    currentRevenueRub: input.current.monthlyRevenueRub,
    targetRevenueRub: input.target.monthlyRevenueRub,
    deadlineMonths: input.target.deadlineMonths,
  } : null;
}
