import * as financeApi from "../api/finance";
import type { Transaction } from "../types/models";
import { UPI_CATEGORY } from "./upiExpenseSync";

export interface MonthRow {
  /** YYYY-MM */
  month: string;
  /** e.g. "October 2026" */
  label: string;
  cashOut: number;
  cashIn: number;
  /** cashIn - cashOut */
  net: number;
  count: number;
}

const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${NAMES[Number(m) - 1] ?? m} ${y}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function toMonthRow(m: financeApi.CategoryMonth): MonthRow {
  return { month: m.month, label: monthLabel(m.month), cashOut: round2(m.cashOut), cashIn: round2(m.cashIn), net: round2(m.cashIn - m.cashOut), count: m.count };
}

/** UPI totals per month (all auto-created UPI accounts together), newest first. The server does the grouping. */
export async function loadUpiMonths(): Promise<MonthRow[]> {
  return (await financeApi.getCategoryMonths(UPI_CATEGORY)).map(toMonthRow).sort((a, b) => b.month.localeCompare(a.month));
}

/** The individual UPI transactions of one month (up to 200), newest first. */
export async function loadUpiMonthTransactions(month: string): Promise<Transaction[]> {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return financeApi.listTransactions({ category: UPI_CATEGORY, from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, limit: 200 });
}
