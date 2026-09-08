import { apiClient } from "./client";

export interface GroupMember {
  id: string;
  name: string;
}

export interface ExpenseGroup {
  id: string;
  name: string;
  createdBy: GroupMember | null;
  members: GroupMember[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSplit {
  user: GroupMember | null;
  amount: number;
}

export interface GroupExpenseEntry {
  id: string;
  groupId: string;
  paidBy: GroupMember | null;
  amount: number;
  description: string;
  category: string;
  date: string;
  splits: ExpenseSplit[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupSettlementEntry {
  id: string;
  groupId: string;
  fromUser: GroupMember | null;
  toUser: GroupMember | null;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
}

export interface MemberBalance {
  userId: string;
  name: string;
  paid: number;
  owed: number;
  settledOut: number;
  settledIn: number;
  net: number;
}

export interface SuggestedTransfer {
  from: GroupMember;
  to: GroupMember;
  amount: number;
}

export interface GroupBalanceSummary {
  balances: MemberBalance[];
  transfers: SuggestedTransfer[];
  totalSpent: number;
}

export interface GroupInput {
  name: string;
  memberIds?: string[];
}

export async function listGroups(): Promise<ExpenseGroup[]> {
  const { data } = await apiClient.get<{ groups: ExpenseGroup[] }>("/group-expenses");
  return data.groups;
}

export async function getGroup(groupId: string): Promise<ExpenseGroup> {
  const { data } = await apiClient.get<{ group: ExpenseGroup }>(`/group-expenses/${groupId}`);
  return data.group;
}

export async function createGroup(input: GroupInput): Promise<ExpenseGroup> {
  const { data } = await apiClient.post<{ group: ExpenseGroup }>("/group-expenses", input);
  return data.group;
}

export async function updateGroup(
  groupId: string,
  input: Partial<GroupInput> & { archived?: boolean }
): Promise<ExpenseGroup> {
  const { data } = await apiClient.put<{ group: ExpenseGroup }>(`/group-expenses/${groupId}`, input);
  return data.group;
}

export async function deleteGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/group-expenses/${groupId}`);
}

export async function getBalances(groupId: string): Promise<GroupBalanceSummary> {
  const { data } = await apiClient.get<GroupBalanceSummary>(`/group-expenses/${groupId}/balances`);
  return data;
}

export interface ExpenseInput {
  paidBy: string;
  amount: number;
  description?: string;
  category?: string;
  date: string;
  splitType?: "equal" | "custom";
  splits?: { userId: string; amount: number }[];
}

export async function listExpenses(groupId: string): Promise<GroupExpenseEntry[]> {
  const { data } = await apiClient.get<{ expenses: GroupExpenseEntry[] }>(`/group-expenses/${groupId}/expenses`);
  return data.expenses;
}

export async function addExpense(groupId: string, input: ExpenseInput): Promise<GroupExpenseEntry> {
  const { data } = await apiClient.post<{ expense: GroupExpenseEntry }>(
    `/group-expenses/${groupId}/expenses`,
    input
  );
  return data.expense;
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  input: Partial<ExpenseInput>
): Promise<GroupExpenseEntry> {
  const { data } = await apiClient.put<{ expense: GroupExpenseEntry }>(
    `/group-expenses/${groupId}/expenses/${expenseId}`,
    input
  );
  return data.expense;
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<void> {
  await apiClient.delete(`/group-expenses/${groupId}/expenses/${expenseId}`);
}

export interface SettlementInput {
  fromUser: string;
  toUser: string;
  amount: number;
  date: string;
  note?: string;
}

export async function listSettlements(groupId: string): Promise<GroupSettlementEntry[]> {
  const { data } = await apiClient.get<{ settlements: GroupSettlementEntry[] }>(
    `/group-expenses/${groupId}/settlements`
  );
  return data.settlements;
}

export async function addSettlement(groupId: string, input: SettlementInput): Promise<GroupSettlementEntry> {
  const { data } = await apiClient.post<{ settlement: GroupSettlementEntry }>(
    `/group-expenses/${groupId}/settlements`,
    input
  );
  return data.settlement;
}
