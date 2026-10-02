import { DateTime } from "luxon";
import { Types, type FilterQuery } from "mongoose";
import { FinanceAccount, type FinanceAccountDocument } from "../models/FinanceAccount";
import { Transaction, type TransactionDocument } from "../models/Transaction";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";

type SettledMode = "all" | "only" | "exclude";

interface SettledBoundary {
  accountId: Types.ObjectId;
  upTo: string;
}

/** The accounts (optionally limited to `accountIds`) that have a settled-up-to date. */
async function settledBoundaries(userId: string, accountIds?: string[]): Promise<SettledBoundary[]> {
  const query: FilterQuery<FinanceAccountDocument> = { userId, settledUpTo: { $ne: null } };
  if (accountIds && accountIds.length > 0) query._id = { $in: accountIds };
  const accounts = await FinanceAccount.find(query);
  return accounts.map((a) => ({ accountId: a._id as Types.ObjectId, upTo: a.settledUpTo as string }));
}

/** Narrows `query` to open (exclude) or settled (only) transactions. Returns false if nothing can match. */
function applySettledMode(query: FilterQuery<TransactionDocument>, mode: SettledMode, boundaries: SettledBoundary[]): boolean {
  if (mode === "all") return true;
  const settledClauses = boundaries.map((b) => ({ accountId: b.accountId, date: { $lte: b.upTo } }));
  if (mode === "only") {
    if (settledClauses.length === 0) return false;
    query.$and = [...(query.$and ?? []), { $or: settledClauses }];
    return true;
  }
  if (settledClauses.length > 0) query.$nor = settledClauses;
  return true;
}

function assertOpenPeriod(account: FinanceAccountDocument, date: string): void {
  if (account.settledUpTo && date <= account.settledUpTo) {
    throw ApiError.badRequest(
      `"${account.name}" is settled up to ${account.settledUpTo}. Reopen the settled period to change entries on or before that date.`
    );
  }
}

/** Settles (closes) an account's transactions up to and including `upTo`; null reopens everything. */
export async function settleAccount(
  userId: string,
  accountId: string,
  upTo: string | null
): Promise<FinanceAccountDocument> {
  const account = await getAccount(userId, accountId);
  account.settledUpTo = upTo;
  await account.save();
  return account;
}

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

  const account = await getAccount(userId, input.accountId); // ensures the account belongs to this user
  assertOpenPeriod(account, input.date);

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

  // A settled entry is closed: it can't be edited until the period is reopened.
  assertOpenPeriod(await getAccount(userId, String(transaction.accountId)), transaction.date);

  if (input.accountId !== undefined) {
    const target = await getAccount(userId, input.accountId);
    assertOpenPeriod(target, input.date ?? transaction.date);
    transaction.accountId = input.accountId as unknown as TransactionDocument["accountId"];
  }
  if (input.accountId === undefined && input.date !== undefined) {
    assertOpenPeriod(await getAccount(userId, String(transaction.accountId)), input.date);
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
  const transaction = await Transaction.findOne({ _id: transactionId, userId });
  if (!transaction) throw ApiError.notFound("Transaction not found");
  assertOpenPeriod(await getAccount(userId, String(transaction.accountId)), transaction.date);
  await Transaction.deleteOne({ _id: transaction._id });
}

export async function getTransaction(userId: string, transactionId: string): Promise<TransactionDocument> {
  const transaction = await Transaction.findOne({ _id: transactionId, userId });
  if (!transaction) throw ApiError.notFound("Transaction not found");
  return transaction;
}

export async function assignTransaction(
  transactionId: string,
  fromUserId: string,
  toUserId: string
): Promise<TransactionDocument> {
  if (toUserId === fromUserId) {
    throw ApiError.badRequest("You cannot assign a transaction to yourself");
  }

  const source = await Transaction.findOne({ _id: transactionId, userId: fromUserId });
  if (!source) throw ApiError.notFound("Transaction not found");

  const recipient = await User.findById(toUserId);
  if (!recipient) throw ApiError.notFound("Recipient user not found");

  const sourceAccount = await FinanceAccount.findOne({ _id: source.accountId, userId: fromUserId });
  if (!sourceAccount) throw ApiError.notFound("Finance account not found");

  // Transaction.accountId is required, and the recipient has no account of their own matching the
  // source. Reuse a same-named account of theirs if one exists, otherwise create one on their behalf
  // so the copy always lands in a valid, owned account.
  let recipientAccount = await FinanceAccount.findOne({ userId: toUserId, name: sourceAccount.name });
  if (!recipientAccount) {
    recipientAccount = await FinanceAccount.create({
      userId: toUserId,
      name: sourceAccount.name,
      description: sourceAccount.description,
      type: sourceAccount.type,
    });
  }

  return Transaction.create({
    userId: toUserId,
    assignedBy: fromUserId,
    accountId: recipientAccount._id,
    type: source.type,
    amount: source.amount,
    category: source.category,
    description: source.description,
    date: source.date,
    time: source.time,
    notes: source.notes,
  });
}

interface ListFilters {
  accountId?: string;
  type?: "IN" | "OUT";
  from?: string;
  to?: string;
  category?: string;
  search?: string;
  /** "exclude" = open entries only, "only" = settled (archived) entries only. Default: everything. */
  settled?: SettledMode;
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

  if (filters.settled && filters.settled !== "all") {
    const boundaries = await settledBoundaries(userId, filters.accountId ? [filters.accountId] : undefined);
    if (!applySettledMode(query, filters.settled, boundaries)) return [];
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

  // Net of what's already settled, per account, so the app can show the still-open balance.
  const settledNet = new Map<string, number>();
  for (const b of await settledBoundaries(userId, accounts.map((a) => String(a._id)))) {
    const dateRange: Record<string, string> = { $lte: b.upTo };
    if (filters.from) dateRange.$gte = filters.from;
    if (filters.to && filters.to < b.upTo) dateRange.$lte = filters.to;
    const rows = await Transaction.aggregate([
      { $match: { userId: new Types.ObjectId(userId), accountId: b.accountId, date: dateRange } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    const net = (rows.find((r) => r._id === "IN")?.total ?? 0) - (rows.find((r) => r._id === "OUT")?.total ?? 0);
    settledNet.set(String(b.accountId), net);
  }

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
      settledUpTo: account.settledUpTo ?? null,
      unsettledBalance: inTotal - outTotal - (settledNet.get(accountIdStr) ?? 0),
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

export interface ExportFilters {
  accountIds?: string[];
  from?: string;
  to?: string;
  type?: "IN" | "OUT";
  settled?: SettledMode;
}

export interface ExportAccountRow {
  id: string;
  name: string;
  type: string;
  settledUpTo: string | null;
  cashIn: number;
  cashOut: number;
}

export interface ExportTransactionRow {
  date: string;
  time: string;
  accountName: string;
  type: "IN" | "OUT";
  category: string;
  description: string;
  amount: number;
  notes: string;
  settled: boolean;
}

export interface ExportData {
  accounts: ExportAccountRow[];
  transactions: ExportTransactionRow[];
  cashIn: number;
  cashOut: number;
}

const EXPORT_ROW_LIMIT = 20000;

/** Everything the Excel / email export needs: matching transactions (oldest first) plus per-account totals. */
export async function getExportData(userId: string, filters: ExportFilters): Promise<ExportData> {
  const accountQuery: FilterQuery<FinanceAccountDocument> = { userId };
  if (filters.accountIds && filters.accountIds.length > 0) accountQuery._id = { $in: filters.accountIds };
  const accounts = await FinanceAccount.find(accountQuery).sort({ createdAt: 1 });
  if (filters.accountIds && filters.accountIds.length > 0 && accounts.length === 0) {
    throw ApiError.notFound("Finance account not found");
  }
  const accountIds = accounts.map((a) => a._id);

  const query: FilterQuery<TransactionDocument> = { userId, accountId: { $in: accountIds } };
  if (filters.type) query.type = filters.type;
  if (filters.from || filters.to) {
    query.date = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }

  const boundaries = await settledBoundaries(userId, accounts.map((a) => String(a._id)));
  const mode = filters.settled ?? "all";
  const rows = applySettledMode(query, mode, boundaries)
    ? await Transaction.find(query).sort({ date: 1, time: 1 }).limit(EXPORT_ROW_LIMIT)
    : [];

  const upToByAccount = new Map(boundaries.map((b) => [String(b.accountId), b.upTo]));
  const nameById = new Map(accounts.map((a) => [String(a._id), a.name]));

  const transactions: ExportTransactionRow[] = rows.map((t) => {
    const upTo = upToByAccount.get(String(t.accountId));
    return {
      date: t.date,
      time: t.time,
      accountName: nameById.get(String(t.accountId)) ?? "",
      type: t.type,
      category: t.category,
      description: t.description,
      amount: t.amount,
      notes: t.notes,
      settled: Boolean(upTo && t.date <= upTo),
    };
  });

  const accountRows: ExportAccountRow[] = accounts.map((a) => {
    const mine = rows.filter((t) => String(t.accountId) === String(a._id));
    return {
      id: String(a._id),
      name: a.name,
      type: a.type,
      settledUpTo: a.settledUpTo ?? null,
      cashIn: mine.filter((t) => t.type === "IN").reduce((sum, t) => sum + t.amount, 0),
      cashOut: mine.filter((t) => t.type === "OUT").reduce((sum, t) => sum + t.amount, 0),
    };
  });

  return {
    accounts: accountRows,
    transactions,
    cashIn: accountRows.reduce((sum, a) => sum + a.cashIn, 0),
    cashOut: accountRows.reduce((sum, a) => sum + a.cashOut, 0),
  };
}
