function xml(value: unknown): string {
  return String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}

function cell(value: unknown, header = false): string {
  const type = typeof value === "number" ? "Number" : typeof value === "boolean" ? "Boolean" : "String";
  return `<Cell${header ? ' ss:StyleID="Header"' : ""}><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
}

export function createSpreadsheetXml(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const widthRows = [headers, ...rows];
  if (widthRows.some((row) => row.length !== headers.length)) throw new Error("Spreadsheet row width mismatch");
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Default"><Alignment ss:Vertical="Top"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#EDE7F2" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="Разборы"><Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${rows.length + 1}" x:FullColumns="1" x:FullRows="1">
<Row ss:Height="45">${headers.map((value) => cell(value, true)).join("")}</Row>${rows.map((row) => `<Row>${row.map((value) => cell(value)).join("")}</Row>`).join("")}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><AutoFilter x:Range="R1C1:R${rows.length + 1}C${headers.length}"/></WorksheetOptions></Worksheet></Workbook>`;
}
