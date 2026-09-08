import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as groupExpenseService from "../services/groupExpenseService";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

function serializeGroup(group: Awaited<ReturnType<typeof groupExpenseService.createGroup>>) {
  const members = (group.members as unknown as PopulatedRef[]) ?? [];
  return {
    id: String(group._id),
    name: group.name,
    createdBy: serializeRef(group.createdBy as unknown as PopulatedRef),
    members: members.map(serializeRef).filter((r): r is { id: string; name: string } => r !== null),
    archived: group.archived,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function serializeExpense(expense: Awaited<ReturnType<typeof groupExpenseService.addExpense>>) {
  const splits = (expense.splits as unknown as { userId: PopulatedRef; amount: number }[]) ?? [];
  return {
    id: String(expense._id),
    groupId: String(expense.groupId),
    paidBy: serializeRef(expense.paidBy as unknown as PopulatedRef),
    amount: expense.amount,
    description: expense.description,
    category: expense.category,
    date: expense.date,
    splits: splits.map((s) => ({ user: serializeRef(s.userId), amount: s.amount })),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

function serializeSettlement(settlement: Awaited<ReturnType<typeof groupExpenseService.addSettlement>>) {
  return {
    id: String(settlement._id),
    groupId: String(settlement.groupId),
    fromUser: serializeRef(settlement.fromUser as unknown as PopulatedRef),
    toUser: serializeRef(settlement.toUser as unknown as PopulatedRef),
    amount: settlement.amount,
    date: settlement.date,
    note: settlement.note,
    createdAt: settlement.createdAt,
  };
}

export const listGroups = asyncHandler(async (req: Request, res: Response) => {
  const groups = await groupExpenseService.listGroups(req.userId!);
  res.json({ groups: groups.map(serializeGroup) });
});

export const getGroup = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupExpenseService.getGroup(req.userId!, req.params.groupId);
  res.json({ group: serializeGroup(group) });
});

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupExpenseService.createGroup(req.userId!, req.body);
  res.status(201).json({ group: serializeGroup(group) });
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  const group = await groupExpenseService.updateGroup(req.userId!, req.params.groupId, req.body);
  res.json({ group: serializeGroup(group) });
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  await groupExpenseService.deleteGroup(req.userId!, req.params.groupId);
  res.status(204).send();
});

export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
  const expenses = await groupExpenseService.listExpenses(req.userId!, req.params.groupId);
  res.json({ expenses: expenses.map(serializeExpense) });
});

export const addExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await groupExpenseService.addExpense(req.userId!, req.params.groupId, req.body);
  res.status(201).json({ expense: serializeExpense(expense) });
});

export const updateExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await groupExpenseService.updateExpense(
    req.userId!,
    req.params.groupId,
    req.params.id,
    req.body
  );
  res.json({ expense: serializeExpense(expense) });
});

export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
  await groupExpenseService.deleteExpense(req.userId!, req.params.groupId, req.params.id);
  res.status(204).send();
});

export const listSettlements = asyncHandler(async (req: Request, res: Response) => {
  const settlements = await groupExpenseService.listSettlements(req.userId!, req.params.groupId);
  res.json({ settlements: settlements.map(serializeSettlement) });
});

export const addSettlement = asyncHandler(async (req: Request, res: Response) => {
  const settlement = await groupExpenseService.addSettlement(req.userId!, req.params.groupId, req.body);
  res.status(201).json({ settlement: serializeSettlement(settlement) });
});

export const getBalances = asyncHandler(async (req: Request, res: Response) => {
  const summary = await groupExpenseService.getGroupBalances(req.userId!, req.params.groupId);
  res.json(summary);
});
