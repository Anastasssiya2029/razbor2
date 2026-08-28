import { getDb } from "@/db";
import { analysisResults, analysisRuns, p03PrescriptionResults, p04ReportResults } from "@/db/schema";
import { storedP03ResultFromRow } from "@/server/p03/repository";
import { storedP04ResultFromRow } from "@/server/p04/repository";
import { eq } from "drizzle-orm";
import type { AnalysisResultRepository, AnalysisResultSource, StoredAnalysisResult } from "./types";

export function storedAnalysisResultFromRow(
  row: typeof analysisResults.$inferSelect,
): StoredAnalysisResult {
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    schemaVersion: row.schemaVersion as StoredAnalysisResult["schemaVersion"],
    methodologyVersion: row.methodologyVersion as StoredAnalysisResult["methodologyVersion"],
    result: JSON.parse(row.resultJson) as StoredAnalysisResult["result"],
  };
}

export function createD1AnalysisResultRepository(): AnalysisResultRepository {
  return {
    async loadSource(analysisRunId): Promise<AnalysisResultSource | null> {
      const db = await getDb();
      const runRows = await db.select({
        analysisRunId: analysisRuns.id,
        diagnosticId: analysisRuns.diagnosticId,
        runStatus: analysisRuns.status,
      }).from(analysisRuns).where(eq(analysisRuns.id, analysisRunId)).limit(1);
      const run = runRows[0];
      if (!run) return null;
      const [p03Rows, p04Rows] = await Promise.all([
        db.select().from(p03PrescriptionResults).where(eq(p03PrescriptionResults.analysisRunId, analysisRunId)).limit(1),
        db.select().from(p04ReportResults).where(eq(p04ReportResults.analysisRunId, analysisRunId)).limit(1),
      ]);
      return {
        analysisRunId: run.analysisRunId,
        diagnosticId: run.diagnosticId,
        runStatus: run.runStatus,
        p03: p03Rows[0] ? storedP03ResultFromRow(p03Rows[0]) : null,
        p04: p04Rows[0] ? storedP04ResultFromRow(p04Rows[0]) : null,
      };
    },

    async loadResult(analysisRunId) {
      const db = await getDb();
      const rows = await db.select().from(analysisResults)
        .where(eq(analysisResults.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? storedAnalysisResultFromRow(rows[0]) : null;
    },

    async createResult(result) {
      const db = await getDb();
      const inserted = await db.insert(analysisResults).values({
        id: result.id,
        diagnosticId: result.diagnosticId,
        analysisRunId: result.analysisRunId,
        schemaVersion: result.schemaVersion,
        methodologyVersion: result.methodologyVersion,
        resultJson: JSON.stringify(result.result),
      }).onConflictDoNothing({ target: analysisResults.analysisRunId })
        .returning({ id: analysisResults.id });
      return inserted.length === 1;
    },
  };
}
