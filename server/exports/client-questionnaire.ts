import { DIAGNOSTIC_FORM_FIELDS } from "@/lib/diagnostic-field-map";
import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";

export type ClientQuestionnaireExportSource = {
  analysisRunId: string;
  createdAt: string;
  clientName: string;
  rawPayload: unknown;
  input: DiagnosticInputV1_2;
};

export type ClientQuestionnaireRow = {
  section: string;
  question: string;
  answer: string | number | boolean | null;
};

const SECTION_BY_SOURCE_KEY: Record<string, string> = {
  expertName: "О клиенте",
  niche: "О клиенте",
  currentIncome: "Текущая точка",
  clientsCount: "Текущая точка",
  weeklyTime: "Текущая точка",
  products: "Текущая точка",
  bestSeller: "Текущая точка",
  freeProducts: "Текущая точка",
  goalIncome: "Денежная цель",
  goalModel: "Денежная цель",
  deadline: "Денежная цель",
  delegate: "Денежная цель",
  systemTime: "Денежная цель",
  clients: "Как работает бизнес",
  result: "Как работает бизнес",
  sources: "Как работает бизнес",
  clientPath: "Как работает бизнес",
  sales: "Как работает бизнес",
  socialAssets: "Как работает бизнес",
  team: "Как работает бизнес",
  uniqueness: "Как работает бизнес",
  struggles: "Опыт и ограничения",
  bestPeriod: "Опыт и ограничения",
  failures: "Опыт и ограничения",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rawParts(payload: unknown): {
  values: Record<string, unknown>;
  metadata: Record<string, unknown>;
} {
  const root = record(payload);
  const answers = record(root.rawAnswers);
  return {
    values: Object.keys(record(answers.values)).length > 0
      ? record(answers.values)
      : answers,
    metadata: Object.keys(answers).length > 0 ? answers : root,
  };
}

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function scalar(value: unknown): string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

function rawAnswer(source: ClientQuestionnaireExportSource, sourceKey: string): string | number | boolean | null {
  const { values, metadata } = rawParts(source.rawPayload);
  const raw = sourceKey === "deadline"
    ? metadata.deadline ?? values.deadline
    : values[sourceKey];
  const direct = scalar(raw);
  if (direct !== null) return direct;
  const definition = DIAGNOSTIC_FORM_FIELDS.find((field) => field.sourceKey === sourceKey);
  if (!definition) return null;
  return scalar(readPath(source.input, definition.targetPaths[0]));
}

function clientCountAnswer(source: ClientQuestionnaireExportSource, answer: string | number | boolean | null) {
  if (answer === null) return null;
  const { values, metadata } = rawParts(source.rawPayload);
  const period = scalar(metadata.clientsCountPeriod ?? values.clientsCountPeriod)
    ?? source.input.current.clientsCountPeriod;
  const label = period === "month" ? "за месяц" : period === "launch" ? "за запуск" : null;
  return label ? `${String(answer)} (${label})` : answer;
}

export function buildClientQuestionnaireRows(
  source: ClientQuestionnaireExportSource,
): ClientQuestionnaireRow[] {
  return DIAGNOSTIC_FORM_FIELDS.map((field) => {
    const answer = rawAnswer(source, field.sourceKey);
    return {
      section: SECTION_BY_SOURCE_KEY[field.sourceKey] ?? "Диагностика",
      question: field.label,
      answer: field.sourceKey === "clientsCount"
        ? clientCountAnswer(source, answer)
        : answer,
    };
  });
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function stringCell(value: unknown, styleId: string, mergeAcross = 0): string {
  return `<Cell ss:StyleID="${styleId}"${mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : ""}><Data ss:Type="String">${xml(value)}</Data></Cell>`;
}

export function createClientQuestionnaireSpreadsheetXml(
  source: ClientQuestionnaireExportSource,
): string {
  const rows = buildClientQuestionnaireRows(source);
  const expandedRows = rows.length + 6;
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Default"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#5D1975" ss:Pattern="Solid"/></Style>
  <Style ss:ID="MetaLabel"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#5D1975"/><Interior ss:Color="#F4E9F6" ss:Pattern="Solid"/></Style>
  <Style ss:ID="MetaValue"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#8E2599" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Section"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#5D1975"/><Interior ss:Color="#F7F0F8" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1CFE5"/></Borders></Style>
  <Style ss:ID="Question"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E9E1EC"/></Borders></Style>
  <Style ss:ID="Answer"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E9E1EC"/></Borders></Style>
</Styles>
<Worksheet ss:Name="Ответы клиента"><Table ss:ExpandedColumnCount="3" ss:ExpandedRowCount="${expandedRows}" x:FullColumns="1" x:FullRows="1">
<Column ss:Width="110"/><Column ss:Width="210"/><Column ss:Width="430"/>
<Row ss:Height="32">${stringCell("Ответы диагностики 7К", "Title", 2)}</Row>
<Row>${stringCell("Клиент", "MetaLabel")}${stringCell(source.clientName, "MetaValue", 1)}</Row>
<Row>${stringCell("Дата разбора", "MetaLabel")}${stringCell(source.createdAt, "MetaValue", 1)}</Row>
<Row>${stringCell("ID разбора", "MetaLabel")}${stringCell(source.analysisRunId, "MetaValue", 1)}</Row>
<Row ss:Height="10">${stringCell("", "MetaValue", 2)}</Row>
<Row ss:Height="30">${stringCell("Раздел", "Header")}${stringCell("Вопрос", "Header")}${stringCell("Ответ клиента", "Header")}</Row>
${rows.map((row) => `<Row>${stringCell(row.section, "Section")}${stringCell(row.question, "Question")}${stringCell(row.answer, "Answer")}</Row>`).join("\n")}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>6</SplitHorizontal><TopRowBottomPane>6</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet></Workbook>`;
}

export function clientQuestionnaireFilename(clientName: string): string {
  const safe = clientName.trim().replace(/[\\/:*?"<>|]+/gu, " ").replace(/\s+/gu, " ").slice(0, 80) || "Клиент";
  return `Ответы_диагностики_7К_${safe}.xls`;
}
