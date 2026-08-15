import { DateTime } from "luxon";
import { Types, type FilterQuery } from "mongoose";
import { FinanceAccount, type FinanceAccountDocument } from "../models/FinanceAccount";
import { Transaction, type TransactionDocument } from "../models/Transaction";
import { ApiError } from "../utils/ApiError";

interface AccountInput {
  name: string;
  description?: string;
  type?: string;
}

export async function createAccount(userId: string, input: AccountInput): Promise<FinanceAccountDocument> {
  const existing = await FinanceAccount.findOne({ userId, name: input.name });
  if (existing) throw ApiError.conflict("An account with this name already exists");
  return FinanceAccount.create({
    userId,
    name: input.name,
    description: input.description ?? "",
    type: input.type ?? "custom",
  });
}

export async function listAccounts(userId: string, includeArchived = false): Promise<FinanceAccountDocument[]> {
  const query: FilterQuery<FinanceAccountDocument> = { userId };
  if (!includeArchived) query.archived = false;
  return FinanceAccount.find(query).sort({ createdAt: 1 });
}

export async function getAccount(userId: string, accountId: string): Promise<FinanceAccountDocument> {
  const account = await FinanceAccount.findOne({ _id: accountId, userId });
  if (!account) throw ApiError.notFound("Finance account not found");
  return account;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: Partial<AccountInput> & { archived?: boolean }
): Promise<FinanceAccountDocument> {
  const account = await getAccount(userId, accountId);
  if (input.name !== undefined) account.name = input.name;
  if (input.description !== undefined) account.description = input.description;
  if (input.type !== undefined) account.type = input.type as FinanceAccountDocument["type"];
  if (input.archived !== undefined) account.archived = input.archived;
  await account.save();
  return account;
}

export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  await getAccount(userId, accountId);
  const transactionCount = await Transaction.countDocuments({ userId, accountId });
  if (transactionCount > 0) {
    throw ApiError.badRequest(
      "This account has transactions. Archive it instead of deleting, or delete its transactions first."
    );
  }
  await FinanceAccount.deleteOne({ _id: accountId, userId });
}

interface TransactionInput {
  accountId: string;
  type: "IN" | "OUT";
  amount: number;
  category?: string;
  description?: string;
  date: string;
  time: string;
  notes?: string;
  idempotencyKey?: string;
}

export async function createTransaction(userId: string, input: TransactionInput): Promise<TransactionDocument> {
  if (input.idempotencyKey) {
    const existing = await Transaction.findOne({ userId, idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
  }

  await getAccount(userId, input.accountId); // ensures the account belongs to this user

  return Transaction.create({
    userId,
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    category: input.category ?? "General",
    description: input.description ?? "",
    date: input.date,
    time: input.time,
    notes: input.notes ?? "",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: Partial<TransactionInput>
): Promise<TransactionDocument> {
  const transaction = await Transaction.findOne({ _id: transactionId, userId });
  if (!transaction) throw ApiError.notFound("Transaction not found");

  if (input.accountId !== undefined) {
    await getAccount(userId, input.accountId);
    transaction.accountId = input.accountId as unknown as TransactionDocument["accountId"];
  }
  if (input.type !== undefined) transaction.type = input.type;
  if (input.amount !== undefined) transaction.amount = input.amount;
  if (input.category !== undefined) transaction.category = input.category;
  if (input.description !== undefined) transaction.description = input.description;
  if (input.date !== undefined) transaction.date = input.date;
  if (input.time !== undefined) transaction.time = input.time;
  if (input.notes !== undefined) transaction.notes = input.notes;

  await transaction.save();
  return transaction;
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<void> {
  const result = await Transaction.deleteOne({ _id: transactionId, userId });
  if (result.deletedCount === 0) throw ApiError.notFound("Transaction not found");
}

export async function getTransaction(userId: string, transactionId: string): Promise<TransactionDocument> {
  const transaction = await Transaction.findOne({ _id: transactionId, userId });
  if (!transaction) throw ApiError.notFound("Transaction not found");
  return transaction;
}

interface ListFilters {
  accountId?: string;
  type?: "IN" | "OUT";
  from?: string;
  to?: string;
  category?: string;
  search?: string;
  limit: number;
}

export async function listTransactions(userId: string, filters: ListFilters): Promise<TransactionDocument[]> {
  const query: FilterQuery<TransactionDocument> = { userId };
  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.type) query.type = filters.type;
  if (filters.category) query.category = filters.category;
  if (filters.from || filters.to) {
    query.date = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  if (filters.search) {
    query.$or = [
      { description: { $regex: filters.search, $options: "i" } },
      { category: { $regex: filters.search, $options: "i" } },
      { notes: { $regex: filters.search, $options: "i" } },
    ];
  }

  return Transaction.find(query)
    .sort({ date: -1, time: -1 })
    .limit(filters.limit);
}

/**
 * Balance/net flow definition: for an account (or overall), balance = sum(IN) - sum(OUT)
 * over the given date range (all-time if no range given). This is a cash-flow balance,
 * not a running ledger balance seeded from an opening amount.
 */
export async function getFinancialSummary(
  userId: string,
  filters: { from?: string; to?: string; accountId?: string }
) {
  // Note: aggregate() bypasses Mongoose's automatic string->ObjectId casting (unlike find()),
  // so ids must be cast to ObjectId explicitly here or the $match will silently match nothing.
  const match: FilterQuery<TransactionDocument> = { userId: new Types.ObjectId(userId) as unknown as TransactionDocument["userId"] };
  if (filters.accountId) {
    match.accountId = new Types.ObjectId(filters.accountId) as unknown as TransactionDocument["accountId"];
  }
  if (filters.from || filters.to) {
    match.date = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }

  const totals = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  const cashIn = totals.find((t) => t._id === "IN")?.total ?? 0;
  const cashOut = totals.find((t) => t._id === "OUT")?.total ?? 0;
  const transactionCount = totals.reduce((sum, t) => sum + t.count, 0);

  const perAccount = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { accountId: "$accountId", type: "$type" },
        total: { $sum: "$amount" },
      },
    },
  ]);

  const accounts = await FinanceAccount.find({ userId, archived: false });
  const accountBreakdown = accounts.map((account) => {
    const accountIdStr = String(account._id);
    const inTotal =
      perAccount.find((p) => String(p._id.accountId) === accountIdStr && p._id.type === "IN")?.total ?? 0;
    const outTotal =
      perAccount.find((p) => String(p._id.accountId) === accountIdStr && p._id.type === "OUT")?.total ?? 0;
    return {
      accountId: accountIdStr,
      name: account.name,
      type: account.type,
      cashIn: inTotal,
      cashOut: outTotal,
      balance: inTotal - outTotal,
    };
  });

  const recentTransactions = await Transaction.find(match).sort({ date: -1, time: -1 }).limit(5);

  return {
    cashIn,
    cashOut,
    netFlow: cashIn - cashOut,
    transactionCount,
    accounts: accountBreakdown,
    recentTransactions,
  };
}

/** Category-level breakdown of spending (OUT transactions only), plus the single biggest expense in range. */
export async function getSpendingAnalysis(
  userId: string,
  filters: { from?: string; to?: string; accountId?: string }
) {
  const match: FilterQuery<TransactionDocument> = {
    userId: new Types.ObjectId(userId) as unknown as TransactionDocument["userId"],
    type: "OUT",
  };
  if (filters.accountId) {
    match.accountId = new Types.ObjectId(filters.accountId) as unknown as TransactionDocument["accountId"];
  }
  if (filters.from || filters.to) {
    match.date = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }

  const byCategory = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);

  const biggestExpense = await Transaction.findOne(match).sort({ amount: -1 });
  const totalSpent = byCategory.reduce((sum, c) => sum + c.total, 0);

  return {
    totalSpent,
    categories: byCategory.map((c) => ({ category: c._id as string, total: c.total as number, count: c.count as number })),
    biggestExpense,
  };
}

/** Cash in / cash out totals grouped by calendar month (YYYY-MM), for trend charts. */
export async function getMonthlyTrend(userId: string, filters: { accountId?: string; months?: number }) {
  const months = filters.months ?? 6;
  const from = DateTime.now().minus({ months: months - 1 }).startOf("month").toISODate() ?? "";

  const match: FilterQuery<TransactionDocument> = {
    userId: new Types.ObjectId(userId) as unknown as TransactionDocument["userId"],
    date: { $gte: from },
  };
  if (filters.accountId) {
    match.accountId = new Types.ObjectId(filters.accountId) as unknown as TransactionDocument["accountId"];
  }

  const rows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { month: { $substr: ["$date", 0, 7] }, type: "$type" },
        total: { $sum: "$amount" },
      },
    },
  ]);

  const monthKeys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    monthKeys.push(DateTime.now().minus({ months: i }).toFormat("yyyy-LL"));
  }

  return monthKeys.map((month) => ({
    month,
    cashIn: rows.find((r) => r._id.month === month && r._id.type === "IN")?.total ?? 0,
    cashOut: rows.find((r) => r._id.month === month && r._id.type === "OUT")?.total ?? 0,
  }));
}
