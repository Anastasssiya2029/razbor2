import ExcelJS from "exceljs";
import { db, diagnosticsTable, clientsTable, appUsersTable, analysisRunsTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";

const RUN_STATUS_LABELS: Record<string, string> = {
  scoring: "Оценка (P-01)",
  targeting: "Целевая конфигурация",
  strategizing: "Стратегия (P-02)",
  resolving_tasks: "Построение плана",
  money_now: "Money Now: подбор",
  money_now_prescribing: "Money Now: рецепт",
  writing_report: "Написание отчёта",
  ready: "Готово",
  analysis_failed: "Ошибка анализа",
};

export type RegistryRow = {
  diagnosticId: string;
  createdAt: Date;
  clientName: string;
  niche: string;
  expertName: string;
  managerName: string;
  lastRunStatus: string;
};

/** Builds the diagnostics registry Excel workbook, already filtered to what `ownerUserId` may see. */
export async function buildRegistryWorkbook(input: { ownerUserId: string; canViewAll: boolean }): Promise<Buffer> {
  const diagnostics = input.canViewAll
    ? await db.select().from(diagnosticsTable).orderBy(desc(diagnosticsTable.createdAt))
    : await db
        .select()
        .from(diagnosticsTable)
        .where(eq(diagnosticsTable.ownerUserId, input.ownerUserId))
        .orderBy(desc(diagnosticsTable.createdAt));

  const clientIds = [...new Set(diagnostics.map((d) => d.clientId))];
  const ownerIds = [...new Set(diagnostics.map((d) => d.ownerUserId))];
  const diagnosticIds = diagnostics.map((d) => d.id);

  const [clients, owners, runs] = await Promise.all([
    clientIds.length ? db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds)) : Promise.resolve([]),
    ownerIds.length ? db.select().from(appUsersTable).where(inArray(appUsersTable.id, ownerIds)) : Promise.resolve([]),
    diagnosticIds.length
      ? db
          .select()
          .from(analysisRunsTable)
          .where(inArray(analysisRunsTable.diagnosticId, diagnosticIds))
          .orderBy(desc(analysisRunsTable.createdAt))
      : Promise.resolve([]),
  ]);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const ownerById = new Map(owners.map((u) => [u.id, u]));
  const latestRunByDiagnosticId = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestRunByDiagnosticId.has(run.diagnosticId)) latestRunByDiagnosticId.set(run.diagnosticId, run);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Твоя Бизнес-Система";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Реестр диагностик");

  sheet.columns = [
    { header: "Дата создания", key: "createdAt", width: 18 },
    { header: "Клиент", key: "clientName", width: 28 },
    { header: "Ниша", key: "niche", width: 24 },
    { header: "Эксперт", key: "expertName", width: 22 },
    { header: "Менеджер", key: "managerName", width: 22 },
    { header: "Статус анализа", key: "status", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const diagnostic of diagnostics) {
    const client = clientById.get(diagnostic.clientId);
    const owner = ownerById.get(diagnostic.ownerUserId);
    const identity = (diagnostic.normalizedInput as { identity?: { niche?: string; expertName?: string } })?.identity;
    const lastRun = latestRunByDiagnosticId.get(diagnostic.id);
    sheet.addRow({
      createdAt: diagnostic.createdAt,
      clientName: client?.displayName ?? "—",
      niche: identity?.niche ?? "—",
      expertName: identity?.expertName ?? "—",
      managerName: owner?.displayName ?? "—",
      status: lastRun ? (RUN_STATUS_LABELS[lastRun.status] ?? lastRun.status) : "Анализ не запущен",
    });
  }
  sheet.getColumn("createdAt").numFmt = "dd.mm.yyyy hh:mm";

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
