import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as financeService from "../services/financeService";
import type { FinanceAccountDocument } from "../models/FinanceAccount";
import type { TransactionDocument } from "../models/Transaction";

function serializeAccount(account: FinanceAccountDocument) {
  return {
    id: String(account._id),
    name: account.name,
    description: account.description,
    type: account.type,
    archived: account.archived,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function serializeTransaction(transaction: TransactionDocument) {
  return {
    id: String(transaction._id),
    accountId: String(transaction.accountId),
    type: transaction.type,
    amount: transaction.amount,
    category: transaction.category,
    description: transaction.description,
    date: transaction.date,
    time: transaction.time,
    notes: transaction.notes,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const account = await financeService.createAccount(req.userId!, req.body);
  res.status(201).json({ account: serializeAccount(account) });
});

export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  const includeArchived = req.query.includeArchived === "true";
  const accounts = await financeService.listAccounts(req.userId!, includeArchived);
  res.json({ accounts: accounts.map(serializeAccount) });
});

export const updateAccount = asyncHandler(async (req: Request, res: Response) => {
  const account = await financeService.updateAccount(req.userId!, req.params.id, req.body);
  res.json({ account: serializeAccount(account) });
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  await financeService.deleteAccount(req.userId!, req.params.id);
  res.status(204).send();
});

export const createTransaction = asyncHandler(async (req: Request, res: Response) => {
  const transaction = await financeService.createTransaction(req.userId!, req.body);
  res.status(201).json({ transaction: serializeTransaction(transaction) });
});

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const transactions = await financeService.listTransactions(req.userId!, req.query as never);
  res.json({ transactions: transactions.map(serializeTransaction) });
});

export const getTransaction = asyncHandler(async (req: Request, res: Response) => {
  const transaction = await financeService.getTransaction(req.userId!, req.params.id);
  res.json({ transaction: serializeTransaction(transaction) });
});

export const updateTransaction = asyncHandler(async (req: Request, res: Response) => {
  const transaction = await financeService.updateTransaction(req.userId!, req.params.id, req.body);
  res.json({ transaction: serializeTransaction(transaction) });
});

export const deleteTransaction = asyncHandler(async (req: Request, res: Response) => {
  await financeService.deleteTransaction(req.userId!, req.params.id);
  res.status(204).send();
});

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await financeService.getFinancialSummary(req.userId!, req.query as never);
  res.json({
    summary: {
      ...summary,
      recentTransactions: summary.recentTransactions.map(serializeTransaction),
    },
  });
});

export const getSpendingAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const analysis = await financeService.getSpendingAnalysis(req.userId!, req.query as never);
  res.json({
    analysis: {
      ...analysis,
      biggestExpense: analysis.biggestExpense ? serializeTransaction(analysis.biggestExpense) : null,
    },
  });
});

export const getMonthlyTrend = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, months } = req.query as { accountId?: string; months?: number };
  const trend = await financeService.getMonthlyTrend(req.userId!, { accountId, months });
  res.json({ trend });
});
