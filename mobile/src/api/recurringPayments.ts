import { apiClient } from "./client";

export interface RecurringPaymentMember {
  id: string;
  name: string;
}

export type RecurringPaymentStatus = "upcoming" | "due-soon" | "overdue" | "paid";

export interface RecurringPaymentHistoryEntry {
  date: string;
  amount: number;
  paid: boolean;
}

export interface RecurringPayment {
  id: string;
  name: string;
  amount: number;
  category: string;
  frequency: "weekly" | "monthly" | "yearly";
  nextDueDate: string;
  accountId: string | null;
  createdBy: RecurringPaymentMember | null;
  sharedWith: RecurringPaymentMember[];
  active: boolean;
  status: RecurringPaymentStatus;
  history: RecurringPaymentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface RecurringPaymentInput {
  name: string;
  amount: number;
  category?: string;
  frequency: "weekly" | "monthly" | "yearly";
  nextDueDate: string;
  accountId?: string | null;
  sharedWith?: string[];
  active?: boolean;
}

export async function listPayments(): Promise<RecurringPayment[]> {
  const { data } = await apiClient.get<{ payments: RecurringPayment[] }>("/recurring-payments");
  return data.payments;
}

export async function getPayment(id: string): Promise<RecurringPayment> {
  const { data } = await apiClient.get<{ payment: RecurringPayment }>(`/recurring-payments/${id}`);
  return data.payment;
}

export async function createPayment(input: RecurringPaymentInput): Promise<RecurringPayment> {
  const { data } = await apiClient.post<{ payment: RecurringPayment }>("/recurring-payments", input);
  return data.payment;
}

export async function updatePayment(
  id: string,
  input: Partial<RecurringPaymentInput>
): Promise<RecurringPayment> {
  const { data } = await apiClient.put<{ payment: RecurringPayment }>(`/recurring-payments/${id}`, input);
  return data.payment;
}

export async function deletePayment(id: string): Promise<void> {
  await apiClient.delete(`/recurring-payments/${id}`);
}

export async function markPaid(id: string, input: { date: string; amount?: number }): Promise<RecurringPayment> {
  const { data } = await apiClient.post<{ payment: RecurringPayment }>(`/recurring-payments/${id}/mark-paid`, input);
  return data.payment;
}
