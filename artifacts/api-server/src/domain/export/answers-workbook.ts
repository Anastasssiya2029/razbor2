import ExcelJS from "exceljs";
import type { Diagnostic } from "@workspace/db";
import { ANSWER_QUESTIONS } from "./question-labels";

export type AnswersExportEntry = { diagnostic: Diagnostic; clientName: string };

/**
 * Builds one Excel workbook holding the raw questionnaire answers for one or more
 * diagnostics side by side: the first row lists the client names, and every
 * following row is one question, with each selected client's answer in its own
 * column.
 */
export async function buildAnswersWorkbook(entries: AnswersExportEntry[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Твоя Бизнес-Система";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Анкеты");

  sheet.getColumn(1).width = 34;
  entries.forEach((_, index) => {
    sheet.getColumn(index + 2).width = 44;
  });

  const headerRow = sheet.addRow(["Клиент", ...entries.map((entry) => entry.clientName)]);
  headerRow.font = { bold: true };

  sheet.addRow(["Дата заполнения", ...entries.map((entry) => entry.diagnostic.createdAt.toLocaleString("ru-RU"))]);

  for (const question of ANSWER_QUESTIONS) {
    sheet.addRow([
      question.question,
      ...entries.map((entry) => question.getValue(entry.diagnostic.rawAnswers)),
    ]);
  }

  for (const row of sheet.getRows(1, sheet.rowCount) ?? []) {
    row.alignment = { vertical: "top", wrapText: true };
  }
  sheet.getColumn(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
