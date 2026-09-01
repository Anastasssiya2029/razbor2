// Thin wrapper exposing the ported reference diagnostics service (verbatim
// scoring/normalization logic) plus the client-lookup helpers routes still
// need for auth checks and exports.
import {
  db,
  clientsTable,
  diagnosticsTable,
  analysisRunsTable,
  analysisResultsTable,
  analysisGiftsTable,
  appUsersTable,
  type Client,
  type Diagnostic,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { BUSINESS_ARCHETYPE_BY_ID, type BusinessArchetypeId } from "@/server/7k/config/archetypes.v2";
import { getCostSummaryByRunIds, type RunCostSummary } from "../analysis-pipeline/cost";

export async function createClient(input: { ownerUserId: string; displayName: string; contactInfo?: string | null }): Promise<Client> {
  const [row] = await db
    .insert(clientsTable)
    .values({ ownerUserId: input.ownerUserId, displayName: input.displayName.trim(), contactInfo: input.contactInfo ?? null })
    .returning();
  if (!row) throw new Error("Failed to create client");
  return row;
}

export {
  createDiagnosticRecord,
  updateDiagnosticDraft,
  getDiagnosticRecord,
  DiagnosticAccessError,
} from "../../reference/server/diagnostics/service";

export async function listClientsForOwner(ownerUserId: string, canViewAll: boolean): Promise<Client[]> {
  if (canViewAll) return db.select().from(clientsTable);
  return db.select().from(clientsTable).where(eq(clientsTable.ownerUserId, ownerUserId));
}

export async function getClientById(clientId: string): Promise<Client | null> {
  const [row] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  return row ?? null;
}

export async function getDiagnosticById(diagnosticId: string): Promise<Diagnostic | null> {
  const [row] = await db.select().from(diagnosticsTable).where(eq(diagnosticsTable.id, diagnosticId));
  return row ?? null;
}

function scoreTotal(scores: Record<string, number> | null | undefined): number | null {
  if (!scores) return null;
  const values = Object.values(scores);
  if (values.length === 0) return null;
  return values.reduce((total, score) => total + (typeof score === "number" ? score : 0), 0);
}

// Returns the same shape as getDiagnosticRecord (client, diagnosticId,
// analysisRunId, status, rawAnswers, input, createdAt, updatedAt) plus the
// dashboard's list-view enrichments (manager, revenue, scores, archetype,
// gift) so the frontend's Diagnostic type (which has no bare `id` field)
// works for both the list and detail views -- a raw drizzle row here
// previously left `diagnosticId`/`analysisRunId`/`client` undefined and
// broke dashboard links.
export async function listDiagnosticsForOwner(ownerUserId: string, canViewAll: boolean, includeCostAndDuration = false) {
  const rows = canViewAll
    ? await db
        .select({ diagnostic: diagnosticsTable, client: clientsTable, manager: appUsersTable })
        .from(diagnosticsTable)
        .leftJoin(clientsTable, eq(diagnosticsTable.clientId, clientsTable.id))
        .leftJoin(appUsersTable, eq(diagnosticsTable.ownerUserId, appUsersTable.id))
    : await db
        .select({ diagnostic: diagnosticsTable, client: clientsTable, manager: appUsersTable })
        .from(diagnosticsTable)
        .leftJoin(clientsTable, eq(diagnosticsTable.clientId, clientsTable.id))
        .leftJoin(appUsersTable, eq(diagnosticsTable.ownerUserId, appUsersTable.id))
        .where(eq(diagnosticsTable.ownerUserId, ownerUserId));

  if (rows.length === 0) return [];

  const diagnosticIds = rows.map((row) => row.diagnostic.id);
  const runRows = await db
    .select()
    .from(analysisRunsTable)
    .where(inArray(analysisRunsTable.diagnosticId, diagnosticIds))
    .orderBy(desc(analysisRunsTable.createdAt));
  const latestRunByDiagnosticId = new Map<string, (typeof runRows)[number]>();
  for (const run of runRows) {
    if (!latestRunByDiagnosticId.has(run.diagnosticId)) latestRunByDiagnosticId.set(run.diagnosticId, run);
  }

  const runIds = runRows.map((run) => run.id);
  const resultRows = runIds.length
    ? await db.select().from(analysisResultsTable).where(inArray(analysisResultsTable.analysisRunId, runIds))
    : [];
  const resultByRunId = new Map(resultRows.map((result) => [result.analysisRunId, result]));

  const resultIds = resultRows.map((result) => result.id);
  const giftRows = resultIds.length
    ? await db.select().from(analysisGiftsTable).where(inArray(analysisGiftsTable.analysisResultId, resultIds))
    : [];
  // A client draws once per tariff, so a result can have up to two gift rows.
  const giftsByResultId = new Map<string, (typeof giftRows)[number][]>();
  for (const gift of giftRows) {
    const existing = giftsByResultId.get(gift.analysisResultId);
    if (existing) existing.push(gift);
    else giftsByResultId.set(gift.analysisResultId, [gift]);
  }

  const costSummaryByRunId: Map<string, RunCostSummary> = includeCostAndDuration
    ? await getCostSummaryByRunIds(runIds)
    : new Map();

  return rows
    .map(({ diagnostic, client, manager }) => {
      const run = latestRunByDiagnosticId.get(diagnostic.id);
      const result = run ? resultByRunId.get(run.id) : undefined;
      const gifts = result ? giftsByResultId.get(result.id) ?? [] : [];
      const resultPayload = (result?.result ?? null) as Record<string, any> | null;
      const input = diagnostic.normalizedInput as Record<string, any> | null;
      const archetypeId = resultPayload?.archetype?.finalArchetype as BusinessArchetypeId | undefined;
      const costSummary = run ? costSummaryByRunId.get(run.id) : undefined;
      return {
        client: client ? { id: client.id, displayName: client.displayName, niche: client.niche } : null,
        manager: manager ? { id: manager.id, displayName: manager.displayName } : null,
        diagnosticId: diagnostic.id,
        analysisRunId: run?.id ?? "",
        status: run?.status ?? "draft",
        rawAnswers: diagnostic.rawAnswers,
        input: diagnostic.normalizedInput,
        currentRevenueRub: input?.current?.monthlyRevenueRub ?? null,
        targetRevenueRub: input?.target?.monthlyRevenueRub ?? null,
        currentTotalScore: scoreTotal(resultPayload?.current?.scores),
        targetTotalScore: scoreTotal(resultPayload?.target?.targetScores),
        archetype: archetypeId ? { id: archetypeId, name: BUSINESS_ARCHETYPE_BY_ID[archetypeId].name } : null,
        gifts: gifts.map((gift) => ({ tariff: gift.tariff, label: gift.giftLabel })),
        resultReady: Boolean(result),
        createdAt: diagnostic.createdAt,
        updatedAt: diagnostic.updatedAt,
        ...(includeCostAndDuration
          ? {
              durationMs: costSummary?.hasData ? costSummary.durationMs : null,
              costRub: costSummary?.hasData ? costSummary.costRub : null,
            }
          : {}),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
