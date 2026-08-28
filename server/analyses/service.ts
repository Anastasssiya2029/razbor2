import { getDb } from "@/db";
import { analysisGifts, analysisResults, analysisRuns, appUsers, clients, diagnostics } from "@/db/schema";
import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { BUSINESS_ARCHETYPE_BY_ID, type BusinessArchetypeId } from "@/server/7k/config/archetypes.v2";
import type { SevenKScores } from "@/server/7k/types";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import { canViewAllAnalyses, type AuthenticatedAppUser } from "@/server/auth";
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

function safeParse<T>(source: string | null): T | null {
  if (!source) return null;
  try {
    return JSON.parse(source) as T;
  } catch {
    return null;
  }
}

export async function listAnalyses(actor: AuthenticatedAppUser): Promise<AnalysisListItem[]> {
  const db = await getDb();
  const base = db
    .select({
      analysisRunId: analysisRuns.id,
      diagnosticId: diagnostics.id,
      createdAt: analysisRuns.createdAt,
      updatedAt: analysisRuns.updatedAt,
      status: analysisRuns.status,
      normalizedInputJson: diagnostics.normalizedInputJson,
      clientId: clients.id,
      clientName: clients.displayName,
      niche: clients.niche,
      managerId: appUsers.id,
      managerName: appUsers.displayName,
      resultJson: analysisResults.resultJson,
      gift: analysisGifts.prizeName,
    })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .leftJoin(clients, eq(diagnostics.clientId, clients.id))
    .leftJoin(appUsers, eq(diagnostics.ownerUserId, appUsers.id))
    .leftJoin(analysisResults, eq(analysisResults.analysisRunId, analysisRuns.id))
    .leftJoin(analysisGifts, eq(analysisGifts.analysisRunId, analysisRuns.id));
  const rows = canViewAllAnalyses(actor.role)
    ? await base.orderBy(desc(analysisRuns.createdAt)).limit(500)
    : await base.where(eq(diagnostics.ownerUserId, actor.id)).orderBy(desc(analysisRuns.createdAt)).limit(500);

  return rows.map((row) => {
    const input = safeParse<DiagnosticInputV1_2>(row.normalizedInputJson);
    const result = safeParse<AnalysisResultV1>(row.resultJson);
    const archetypeId = result?.archetype.finalArchetype;
    return {
      analysisRunId: row.analysisRunId,
      diagnosticId: row.diagnosticId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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
  const db = await getDb();
  const rows = await db
    .select({ normalizedInputJson: diagnostics.normalizedInputJson })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  const input = safeParse<DiagnosticInputV1_2>(rows[0]?.normalizedInputJson ?? null);
  return input ? {
    currentRevenueRub: input.current.monthlyRevenueRub,
    targetRevenueRub: input.target.monthlyRevenueRub,
    deadlineMonths: input.target.deadlineMonths,
  } : null;
}
