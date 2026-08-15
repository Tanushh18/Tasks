import { apiClient } from "./client";
import type { AccountType, FinanceAccount, FinancialSummary, Transaction, TransactionType } from "../types/models";

export interface AccountInput {
  name: string;
  description?: string;
  type?: AccountType;
}

export async function listAccounts(includeArchived = false): Promise<FinanceAccount[]> {
  const { data } = await apiClient.get<{ accounts: FinanceAccount[] }>("/finance/accounts", {
    params: includeArchived ? { includeArchived: "true" } : undefined,
  });
  return data.accounts;
}

export async function createAccount(input: AccountInput): Promise<FinanceAccount> {
  const { data } = await apiClient.post<{ account: FinanceAccount }>("/finance/accounts", input);
  return data.account;
}

export async function updateAccount(
  id: string,
  input: Partial<AccountInput> & { archived?: boolean }
): Promise<FinanceAccount> {
  const { data } = await apiClient.put<{ account: FinanceAccount }>(`/finance/accounts/${id}`, input);
  return data.account;
}

export async function deleteAccount(id: string): Promise<void> {
  await apiClient.delete(`/finance/accounts/${id}`);
}

export interface TransactionInput {
  accountId: string;
  type: TransactionType;
  amount: number;
  category?: string;
  description?: string;
  date: string;
  time: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface TransactionFilters {
  accountId?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
  category?: string;
  search?: string;
  limit?: number;
}

export async function listTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const { data } = await apiClient.get<{ transactions: Transaction[] }>("/finance/transactions", {
    params: filters,
  });
  return data.transactions;
}

export async function getTransaction(id: string): Promise<Transaction> {
  const { data } = await apiClient.get<{ transaction: Transaction }>(`/finance/transactions/${id}`);
  return data.transaction;
}

export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const { data } = await apiClient.post<{ transaction: Transaction }>("/finance/transactions", input);
  return data.transaction;
}

export async function updateTransaction(id: string, input: Partial<TransactionInput>): Promise<Transaction> {
  const { data } = await apiClient.put<{ transaction: Transaction }>(`/finance/transactions/${id}`, input);
  return data.transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiClient.delete(`/finance/transactions/${id}`);
}

export async function getFinancialSummary(filters: {
  from?: string;
  to?: string;
  accountId?: string;
} = {}): Promise<FinancialSummary> {
  const { data } = await apiClient.get<{ summary: FinancialSummary }>("/finance/summary", { params: filters });
  return data.summary;
}

export interface SpendingCategory {
  category: string;
  total: number;
  count: number;
}

export interface SpendingAnalysis {
  totalSpent: number;
  categories: SpendingCategory[];
  biggestExpense: Transaction | null;
}

export async function getSpendingAnalysis(filters: {
  from?: string;
  to?: string;
  accountId?: string;
} = {}): Promise<SpendingAnalysis> {
  const { data } = await apiClient.get<{ analysis: SpendingAnalysis }>("/finance/spending-analysis", { params: filters });
  return data.analysis;
}

export interface MonthlyTrendPoint {
  month: string;
  cashIn: number;
  cashOut: number;
}

export async function getMonthlyTrend(filters: { accountId?: string; months?: number } = {}): Promise<MonthlyTrendPoint[]> {
  const { data } = await apiClient.get<{ trend: MonthlyTrendPoint[] }>("/finance/monthly-trend", { params: filters });
  return data.trend;
}
