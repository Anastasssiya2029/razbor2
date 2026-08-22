import { getDb } from "@/db";
import { analysisSheetSyncs } from "@/db/schema";
import { ANALYSIS_EXPORT_HEADERS, buildAnalysisExportRow, loadAnalysisExportSource } from "@/server/exports";
import { eq, sql } from "drizzle-orm";
import { upsertGoogleSheetRow, type GoogleSheetsEnvironment } from "./client";

async function environment(): Promise<GoogleSheetsEnvironment | null> {
  const { env } = await import("cloudflare:workers");
  const clientEmail = typeof env.GOOGLE_SHEETS_CLIENT_EMAIL === "string" ? env.GOOGLE_SHEETS_CLIENT_EMAIL.trim() : "";
  const privateKey = typeof env.GOOGLE_SHEETS_PRIVATE_KEY === "string" ? env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/gu, "\n").trim() : "";
  const spreadsheetId = typeof env.GOOGLE_SHEETS_SPREADSHEET_ID === "string" ? env.GOOGLE_SHEETS_SPREADSHEET_ID.trim() : "";
  const tabName = typeof env.GOOGLE_SHEETS_TAB_NAME === "string" ? env.GOOGLE_SHEETS_TAB_NAME.trim() : "Лист1";
  return clientEmail && privateKey && spreadsheetId ? { clientEmail, privateKey, spreadsheetId, tabName } : null;
}

async function mark(analysisRunId: string, status: "synced" | "failed" | "not_configured", errorCode: string | null) {
  const db = await getDb();
  await db.insert(analysisSheetSyncs).values({
    analysisRunId, status, attempts: status === "not_configured" ? 0 : 1,
    lastErrorCode: errorCode, syncedAt: status === "synced" ? new Date().toISOString() : null,
  }).onConflictDoUpdate({ target: analysisSheetSyncs.analysisRunId, set: {
    status, attempts: status === "not_configured" ? sql`${analysisSheetSyncs.attempts}` : sql`${analysisSheetSyncs.attempts} + 1`,
    lastErrorCode: errorCode, syncedAt: status === "synced" ? new Date().toISOString() : null, updatedAt: new Date().toISOString(),
  } });
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  return /^GOOGLE_[A-Z0-9_]+$/u.test(message) ? message.slice(0, 80) : "GOOGLE_SHEETS_SYNC_FAILED";
}

export async function syncAnalysisToGoogleSheet(analysisRunId: string): Promise<{ status: "synced" | "failed" | "not_configured" }> {
  const configured = await environment();
  if (!configured) { await mark(analysisRunId, "not_configured", null); return { status: "not_configured" }; }
  const source = await loadAnalysisExportSource(analysisRunId);
  if (!source) { await mark(analysisRunId, "failed", "GOOGLE_SHEETS_RESULT_NOT_READY"); return { status: "failed" }; }
  try {
    await upsertGoogleSheetRow({ environment: configured, headers: ANALYSIS_EXPORT_HEADERS, row: buildAnalysisExportRow(source) });
    await mark(analysisRunId, "synced", null);
    return { status: "synced" };
  } catch (error) {
    await mark(analysisRunId, "failed", safeErrorCode(error));
    return { status: "failed" };
  }
}

export async function getAnalysisSheetSync(analysisRunId: string) {
  const db = await getDb();
  const rows = await db.select().from(analysisSheetSyncs).where(eq(analysisSheetSyncs.analysisRunId, analysisRunId)).limit(1);
  return rows[0] ?? null;
}
