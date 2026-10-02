import ExcelJS from "exceljs";
import type { ExportData, ExportFilters } from "./financeService";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
const MONEY_FORMAT = "#,##0.00";

function periodLabel(filters: ExportFilters): string {
  if (filters.from && filters.to) return `${filters.from} to ${filters.to}`;
  if (filters.from) return `From ${filters.from}`;
  if (filters.to) return `Up to ${filters.to}`;
  return "All time";
}

function settledLabel(filters: ExportFilters): string {
  if (filters.settled === "only") return "Settled entries only";
  if (filters.settled === "exclude") return "Open (unsettled) entries only";
  return "Open and settled entries";
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

/** Builds the workbook: a Summary sheet (period, per-account totals) and a Transactions sheet. */
export async function buildFinanceWorkbook(data: ExportData, filters: ExportFilters, generatedFor: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tasks app";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
  ];
  summary.addRow(["Money report"]).font = { bold: true, size: 16 };
  summary.addRow(["Prepared for", generatedFor]);
  summary.addRow(["Period", periodLabel(filters)]);
  summary.addRow(["Showing", settledLabel(filters)]);
  if (filters.type) summary.addRow(["Type", filters.type === "IN" ? "Cash in only" : "Cash out only"]);
  summary.addRow(["Generated", new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"]);
  summary.addRow([]);

  styleHeader(summary.addRow(["Account", "Cash in", "Cash out", "Net", "Settled up to"]));
  for (const account of data.accounts) {
    const row = summary.addRow([
      account.name,
      account.cashIn,
      account.cashOut,
      account.cashIn - account.cashOut,
      account.settledUpTo ?? "Not settled",
    ]);
    [2, 3, 4].forEach((c) => (row.getCell(c).numFmt = MONEY_FORMAT));
  }
  const totalRow = summary.addRow(["Total", data.cashIn, data.cashOut, data.cashIn - data.cashOut, ""]);
  totalRow.font = { bold: true };
  [2, 3, 4].forEach((c) => (totalRow.getCell(c).numFmt = MONEY_FORMAT));

  const sheet = workbook.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Time", key: "time", width: 8 },
    { header: "Account", key: "account", width: 22 },
    { header: "Type", key: "type", width: 10 },
    { header: "Category", key: "category", width: 18 },
    { header: "Description", key: "description", width: 34 },
    { header: "Cash in", key: "cashIn", width: 14 },
    { header: "Cash out", key: "cashOut", width: 14 },
    { header: "Status", key: "status", width: 10 },
    { header: "Notes", key: "notes", width: 34 },
  ];
  styleHeader(sheet.getRow(1));
  for (const t of data.transactions) {
    sheet.addRow({
      date: t.date,
      time: t.time,
      account: t.accountName,
      type: t.type === "IN" ? "Cash in" : "Cash out",
      category: t.category,
      description: t.description,
      cashIn: t.type === "IN" ? t.amount : null,
      cashOut: t.type === "OUT" ? t.amount : null,
      status: t.settled ? "Settled" : "Open",
      notes: t.notes,
    });
  }
  sheet.getColumn("cashIn").numFmt = MONEY_FORMAT;
  sheet.getColumn("cashOut").numFmt = MONEY_FORMAT;
  if (data.transactions.length > 0) {
    sheet.autoFilter = { from: "A1", to: { row: 1, column: sheet.columns.length } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function exportFileName(filters: ExportFilters): string {
  const range = filters.from || filters.to ? `${filters.from ?? "start"}_to_${filters.to ?? "today"}` : "all-time";
  return `money-report-${range}.xlsx`;
}

export function exportSummaryText(data: ExportData, filters: ExportFilters): string {
  const net = data.cashIn - data.cashOut;
  return [
    `Period: ${periodLabel(filters)}`,
    `Accounts: ${data.accounts.map((a) => a.name).join(", ") || "none"}`,
    `Entries: ${data.transactions.length}`,
    `Cash in: ${data.cashIn.toFixed(2)}`,
    `Cash out: ${data.cashOut.toFixed(2)}`,
    `Net: ${net.toFixed(2)}`,
  ].join("\n");
}
