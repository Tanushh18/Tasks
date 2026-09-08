import { ExpenseGroup, type ExpenseGroupDocument } from "../models/ExpenseGroup";
import { GroupExpense, type GroupExpenseDocument } from "../models/GroupExpense";
import { GroupSettlement, type GroupSettlementDocument } from "../models/GroupSettlement";
import { ApiError } from "../utils/ApiError";

const CENTS_EPSILON = 0.005; // amounts are rounded to the cent; treat anything smaller as equal

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scopedQuery(userId: string) {
  return { $or: [{ createdBy: userId }, { members: userId }] };
}

async function getMembershipGroup(userId: string, groupId: string): Promise<ExpenseGroupDocument> {
  const group = await ExpenseGroup.findOne({ _id: groupId, ...scopedQuery(userId) });
  if (!group) throw ApiError.notFound("Group not found");
  return group;
}

async function getOwnedGroup(userId: string, groupId: string): Promise<ExpenseGroupDocument> {
  const group = await ExpenseGroup.findById(groupId);
  if (!group) throw ApiError.notFound("Group not found");
  if (String(group.createdBy) !== String(userId)) {
    throw ApiError.forbidden("Only the group's creator can make this change");
  }
  return group;
}

// --- Groups -------------------------------------------------------------------

export interface GroupInput {
  name: string;
  memberIds?: string[];
}

export async function listGroups(userId: string): Promise<ExpenseGroupDocument[]> {
  return ExpenseGroup.find(scopedQuery(userId))
    .populate("createdBy", "name")
    .populate("members", "name")
    .sort("-createdAt");
}

export async function getGroup(userId: string, groupId: string): Promise<ExpenseGroupDocument> {
  const group = await getMembershipGroup(userId, groupId);
  return group.populate([
    { path: "createdBy", select: "name" },
    { path: "members", select: "name" },
  ]);
}

export async function createGroup(userId: string, input: GroupInput): Promise<ExpenseGroupDocument> {
  const members = Array.from(new Set([userId, ...(input.memberIds ?? [])]));
  const group = await ExpenseGroup.create({ name: input.name, createdBy: userId, members });
  return group.populate([
    { path: "createdBy", select: "name" },
    { path: "members", select: "name" },
  ]);
}

export async function updateGroup(
  userId: string,
  groupId: string,
  input: Partial<GroupInput> & { archived?: boolean }
): Promise<ExpenseGroupDocument> {
  const group = await getOwnedGroup(userId, groupId);
  if (input.name !== undefined) group.name = input.name;
  if (input.archived !== undefined) group.archived = input.archived;
  if (input.memberIds !== undefined) {
    const members = Array.from(new Set([String(group.createdBy), ...input.memberIds]));
    group.members = members as unknown as ExpenseGroupDocument["members"];
  }
  await group.save();
  return group.populate([
    { path: "createdBy", select: "name" },
    { path: "members", select: "name" },
  ]);
}

export async function deleteGroup(userId: string, groupId: string): Promise<void> {
  const group = await getOwnedGroup(userId, groupId);
  await Promise.all([
    GroupExpense.deleteMany({ groupId: group._id }),
    GroupSettlement.deleteMany({ groupId: group._id }),
    ExpenseGroup.deleteOne({ _id: group._id }),
  ]);
}

// --- Expenses -------------------------------------------------------------------

export interface ExpenseInput {
  paidBy: string;
  amount: number;
  description?: string;
  category?: string;
  date: string;
  splitType?: "equal" | "custom";
  splits?: { userId: string; amount: number }[];
}

function buildSplits(group: ExpenseGroupDocument, input: ExpenseInput): { userId: string; amount: number }[] {
  const memberIds = group.members.map((m) => String(m));

  if (!memberIds.includes(input.paidBy)) {
    throw ApiError.badRequest("The person who paid must be a member of this group");
  }

  if (input.splitType === "custom") {
    const splits = input.splits ?? [];
    if (splits.length === 0) throw ApiError.badRequest("Custom splits require at least one entry");
    for (const split of splits) {
      if (!memberIds.includes(split.userId)) {
        throw ApiError.badRequest("Every split must belong to a group member");
      }
    }
    const total = round2(splits.reduce((sum, s) => sum + s.amount, 0));
    if (Math.abs(total - round2(input.amount)) > CENTS_EPSILON) {
      throw ApiError.badRequest(`Splits (${total}) must add up to the total amount (${input.amount})`);
    }
    return splits.map((s) => ({ userId: s.userId, amount: round2(s.amount) }));
  }

  // Equal split across every current member, distributing the leftover cent(s)
  // from integer division onto the first members so the split still sums exactly.
  const count = memberIds.length;
  const totalCents = Math.round(input.amount * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents - baseCents * count;
  return memberIds.map((userId, index) => ({
    userId,
    amount: round2((baseCents + (index < remainder ? 1 : 0)) / 100),
  }));
}

export async function listExpenses(userId: string, groupId: string): Promise<GroupExpenseDocument[]> {
  await getMembershipGroup(userId, groupId);
  return GroupExpense.find({ groupId }).populate("paidBy", "name").populate("splits.userId", "name").sort("-date -createdAt");
}

export async function addExpense(
  userId: string,
  groupId: string,
  input: ExpenseInput
): Promise<GroupExpenseDocument> {
  const group = await getMembershipGroup(userId, groupId);
  const splits = buildSplits(group, input);

  const expense = await GroupExpense.create({
    groupId,
    paidBy: input.paidBy,
    amount: round2(input.amount),
    description: input.description ?? "",
    category: input.category ?? "General",
    date: input.date,
    splits,
  });
  return expense.populate([
    { path: "paidBy", select: "name" },
    { path: "splits.userId", select: "name" },
  ]);
}

export async function updateExpense(
  userId: string,
  groupId: string,
  expenseId: string,
  input: Partial<ExpenseInput>
): Promise<GroupExpenseDocument> {
  const group = await getMembershipGroup(userId, groupId);
  const expense = await GroupExpense.findOne({ _id: expenseId, groupId });
  if (!expense) throw ApiError.notFound("Expense not found");

  const merged: ExpenseInput = {
    paidBy: input.paidBy ?? String(expense.paidBy),
    amount: input.amount ?? expense.amount,
    description: input.description ?? expense.description,
    category: input.category ?? expense.category,
    date: input.date ?? expense.date,
    splitType: input.splitType ?? (input.splits ? "custom" : "equal"),
    splits: input.splits,
  };

  // Re-derive splits whenever anything that affects them changed, otherwise
  // keep the expense's existing splits untouched (e.g. a description-only edit).
  const needsResplit = input.amount !== undefined || input.splits !== undefined || input.paidBy !== undefined;
  const splits = needsResplit
    ? buildSplits(group, merged)
    : (expense.splits as unknown as { userId: string; amount: number }[]);

  expense.paidBy = merged.paidBy as unknown as GroupExpenseDocument["paidBy"];
  expense.amount = round2(merged.amount);
  expense.description = merged.description ?? "";
  expense.category = merged.category ?? "General";
  expense.date = merged.date;
  expense.splits = splits as unknown as GroupExpenseDocument["splits"];

  await expense.save();
  return expense.populate([
    { path: "paidBy", select: "name" },
    { path: "splits.userId", select: "name" },
  ]);
}

export async function deleteExpense(userId: string, groupId: string, expenseId: string): Promise<void> {
  await getMembershipGroup(userId, groupId);
  const result = await GroupExpense.deleteOne({ _id: expenseId, groupId });
  if (result.deletedCount === 0) throw ApiError.notFound("Expense not found");
}

// --- Settlements ------------------------------------------------------------

export interface SettlementInput {
  fromUser: string;
  toUser: string;
  amount: number;
  date: string;
  note?: string;
}

export async function listSettlements(userId: string, groupId: string): Promise<GroupSettlementDocument[]> {
  await getMembershipGroup(userId, groupId);
  return GroupSettlement.find({ groupId }).populate("fromUser", "name").populate("toUser", "name").sort("-date -createdAt");
}

export async function addSettlement(
  userId: string,
  groupId: string,
  input: SettlementInput
): Promise<GroupSettlementDocument> {
  const group = await getMembershipGroup(userId, groupId);
  const memberIds = group.members.map((m) => String(m));
  if (!memberIds.includes(input.fromUser) || !memberIds.includes(input.toUser)) {
    throw ApiError.badRequest("Both people in a settlement must be group members");
  }
  if (input.fromUser === input.toUser) {
    throw ApiError.badRequest("A settlement needs two different people");
  }

  const settlement = await GroupSettlement.create({
    groupId,
    fromUser: input.fromUser,
    toUser: input.toUser,
    amount: round2(input.amount),
    date: input.date,
    note: input.note ?? "",
  });
  return settlement.populate([
    { path: "fromUser", select: "name" },
    { path: "toUser", select: "name" },
  ]);
}

// --- Balances & suggested settle-up transfers --------------------------------

export interface MemberBalance {
  userId: string;
  name: string;
  paid: number; // total this person has fronted across all expenses
  owed: number; // total this person's share of all expenses adds up to
  settledOut: number; // total this person has paid to others via settlements
  settledIn: number; // total this person has received from others via settlements
  net: number; // positive = this person is owed money overall; negative = they owe money
}

export interface SuggestedTransfer {
  from: { userId: string; name: string };
  to: { userId: string; name: string };
  amount: number;
}

export interface GroupBalanceSummary {
  balances: MemberBalance[];
  transfers: SuggestedTransfer[];
  totalSpent: number;
}

export async function getGroupBalances(userId: string, groupId: string): Promise<GroupBalanceSummary> {
  const group = await getMembershipGroup(userId, groupId);
  await group.populate("members", "name");

  const [expenses, settlements] = await Promise.all([
    GroupExpense.find({ groupId }),
    GroupSettlement.find({ groupId }),
  ]);

  const byId = new Map<string, MemberBalance>();
  for (const member of group.members as unknown as { _id: unknown; name: string }[]) {
    const id = String(member._id);
    byId.set(id, { userId: id, name: member.name, paid: 0, owed: 0, settledOut: 0, settledIn: 0, net: 0 });
  }

  let totalSpent = 0;
  for (const expense of expenses) {
    totalSpent += expense.amount;
    const payer = byId.get(String(expense.paidBy));
    if (payer) payer.paid = round2(payer.paid + expense.amount);
    for (const split of expense.splits as unknown as { userId: unknown; amount: number }[]) {
      const member = byId.get(String(split.userId));
      if (member) member.owed = round2(member.owed + split.amount);
    }
  }

  for (const settlement of settlements) {
    const from = byId.get(String(settlement.fromUser));
    const to = byId.get(String(settlement.toUser));
    if (from) from.settledOut = round2(from.settledOut + settlement.amount);
    if (to) to.settledIn = round2(to.settledIn + settlement.amount);
  }

  for (const balance of byId.values()) {
    balance.net = round2(balance.paid - balance.owed + balance.settledOut - balance.settledIn);
  }

  const transfers = simplifyDebts(Array.from(byId.values()));

  return { balances: Array.from(byId.values()), transfers, totalSpent: round2(totalSpent) };
}

/**
 * Greedy debt simplification: repeatedly settle the biggest creditor against
 * the biggest debtor. This minimizes the number of suggested payments needed
 * to zero everyone out, rather than resolving every expense pairwise.
 */
function simplifyDebts(balances: MemberBalance[]): SuggestedTransfer[] {
  const creditors = balances
    .filter((b) => b.net > CENTS_EPSILON)
    .map((b) => ({ userId: b.userId, name: b.name, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.net < -CENTS_EPSILON)
    .map((b) => ({ userId: b.userId, name: b.name, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: SuggestedTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.amount, creditor.amount));

    if (amount > CENTS_EPSILON) {
      transfers.push({
        from: { userId: debtor.userId, name: debtor.name },
        to: { userId: creditor.userId, name: creditor.name },
        amount,
      });
    }

    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);
    if (debtor.amount <= CENTS_EPSILON) i++;
    if (creditor.amount <= CENTS_EPSILON) j++;
  }

  return transfers;
}
