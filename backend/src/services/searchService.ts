import { FinanceAccount } from "../models/FinanceAccount";
import * as financeService from "./financeService";
import * as taskService from "./taskService";

const RESULT_LIMIT = 10;

export async function globalSearch(userId: string, query: string) {
  const [tasks, transactions, accounts] = await Promise.all([
    taskService.listTasks(userId, { status: "all", search: query, sort: "date_asc" }),
    financeService.listTransactions(userId, { search: query, limit: RESULT_LIMIT }),
    FinanceAccount.find({ userId, archived: false, name: { $regex: query, $options: "i" } }).limit(RESULT_LIMIT),
  ]);

  return {
    tasks: tasks.slice(0, RESULT_LIMIT).map((t) => ({
      id: String(t._id),
      title: t.title,
      date: t.date,
      time: t.time,
      completed: t.completed,
    })),
    transactions: transactions.map((t) => ({
      id: String(t._id),
      accountId: String(t.accountId),
      type: t.type,
      amount: t.amount,
      category: t.category,
      description: t.description,
      date: t.date,
    })),
    accounts: accounts.map((a) => ({ id: String(a._id), name: a.name, type: a.type })),
  };
}
