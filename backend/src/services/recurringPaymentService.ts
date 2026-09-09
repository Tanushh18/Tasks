import { RecurringPayment, type RecurringPaymentDocument } from "../models/RecurringPayment";
import { ApiError } from "../utils/ApiError";

const DAY_MS = 24 * 60 * 60 * 1000;

function scopedQuery(userId: string) {
  return { $or: [{ createdBy: userId }, { sharedWith: userId }] };
}

async function getOwnedPayment(userId: string, id: string): Promise<RecurringPaymentDocument> {
  const payment = await RecurringPayment.findOne({ _id: id, ...scopedQuery(userId) });
  if (!payment) throw ApiError.notFound("Recurring payment not found");
  return payment;
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

export type PaymentStatus = "upcoming" | "due-soon" | "overdue" | "paid";

// Advances a YYYY-MM-DD date string by one period of the given frequency.
export function advanceDate(dateStr: string, frequency: "weekly" | "monthly" | "yearly"): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === "monthly") {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  }
  return date.toISOString().slice(0, 10);
}

// Status is computed at read time from nextDueDate rather than stored, so it
// always reflects "today" without needing a background job to keep it fresh.
export function computeStatus(nextDueDate: string, active: boolean, today = new Date()): PaymentStatus {
  if (!active) return "paid";
  const todayStr = today.toISOString().slice(0, 10);
  const diffDays = Math.round((Date.parse(nextDueDate) - Date.parse(todayStr)) / DAY_MS);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "due-soon";
  return "upcoming";
}

export async function listPayments(userId: string): Promise<RecurringPaymentDocument[]> {
  return RecurringPayment.find(scopedQuery(userId))
    .populate("createdBy", "name")
    .populate("sharedWith", "name")
    .sort("nextDueDate");
}

export async function getPayment(userId: string, id: string): Promise<RecurringPaymentDocument> {
  const payment = await getOwnedPayment(userId, id);
  return payment.populate([
    { path: "createdBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}

export async function createPayment(
  userId: string,
  input: RecurringPaymentInput
): Promise<RecurringPaymentDocument> {
  const payment = await RecurringPayment.create({
    name: input.name,
    amount: input.amount,
    category: input.category ?? "General",
    frequency: input.frequency,
    nextDueDate: input.nextDueDate,
    accountId: input.accountId ?? null,
    createdBy: userId,
    sharedWith: input.sharedWith ?? [],
    active: input.active ?? true,
    history: [],
  });
  return payment.populate([
    { path: "createdBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}

export async function updatePayment(
  userId: string,
  id: string,
  input: Partial<RecurringPaymentInput>
): Promise<RecurringPaymentDocument> {
  const payment = await getOwnedPayment(userId, id);
  if (input.name !== undefined) payment.name = input.name;
  if (input.amount !== undefined) payment.amount = input.amount;
  if (input.category !== undefined) payment.category = input.category;
  if (input.frequency !== undefined) payment.frequency = input.frequency;
  if (input.nextDueDate !== undefined) payment.nextDueDate = input.nextDueDate;
  if (input.accountId !== undefined) {
    payment.accountId = input.accountId as unknown as RecurringPaymentDocument["accountId"];
  }
  if (input.sharedWith !== undefined) {
    payment.sharedWith = input.sharedWith as unknown as RecurringPaymentDocument["sharedWith"];
  }
  if (input.active !== undefined) payment.active = input.active;
  await payment.save();
  return payment.populate([
    { path: "createdBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}

export async function deletePayment(userId: string, id: string): Promise<void> {
  await getOwnedPayment(userId, id);
  await RecurringPayment.deleteOne({ _id: id });
}

export async function markPaid(
  userId: string,
  id: string,
  input: { date: string; amount?: number }
): Promise<RecurringPaymentDocument> {
  const payment = await getOwnedPayment(userId, id);
  const amount = input.amount ?? payment.amount;
  payment.history.push({ date: input.date, amount, paid: true } as never);
  payment.nextDueDate = advanceDate(payment.nextDueDate, payment.frequency as "weekly" | "monthly" | "yearly");
  await payment.save();
  return payment.populate([
    { path: "createdBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}
