import * as financeService from "./financeService";
import * as taskService from "./taskService";
import { ApiError } from "../utils/ApiError";
import type { ToolDeclaration } from "./geminiService";

/** Tools whose mutations are financial and must be confirmed by the user before executing, unless the user has turned confirmation off. */
export const CONFIRMATION_REQUIRED_TOOLS = new Set(["createTransaction", "updateTransaction", "deleteTransaction"]);

const dateProp = { type: "string", description: "Date in YYYY-MM-DD format" };
const timeProp = { type: "string", description: "24-hour time in HH:mm format" };

export const assistantTools: ToolDeclaration[] = [
  {
    name: "createTask",
    description: "Create a new task, optionally with a date-specific reminder and/or recurrence.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        date: dateProp,
        time: timeProp,
        priority: { type: "string", enum: ["low", "medium", "high"] },
        category: { type: "string" },
        reminderEnabled: { type: "boolean", description: "Whether to notify the user at date/time" },
        recurrenceType: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
        notes: { type: "string" },
      },
      required: ["title", "date", "time"],
    },
  },
  {
    name: "updateTask",
    description: "Update fields on an existing task. Look up the taskId with getTasks first if you don't already have it.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        date: dateProp,
        time: timeProp,
        priority: { type: "string", enum: ["low", "medium", "high"] },
        category: { type: "string" },
        reminderEnabled: { type: "boolean" },
        recurrenceType: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
        notes: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "completeTask",
    description: "Mark a task complete or, if completed=false, mark it incomplete again.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        completed: { type: "boolean" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "deleteTask",
    description: "Permanently delete a task.",
    parameters: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
  },
  {
    name: "getTasks",
    description: "List the user's tasks, optionally filtered, to find a task's id or answer questions about tasks.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["all", "pending", "completed", "overdue"] },
        date: dateProp,
        search: { type: "string", description: "Free-text search over title/description/notes" },
      },
    },
  },
  {
    name: "createFinanceAccount",
    description: "Create a new finance account/category, e.g. 'Home Expenses' or 'Business'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        type: {
          type: "string",
          enum: ["home", "office", "personal", "travel", "business", "education", "savings", "custom"],
        },
      },
      required: ["name"],
    },
  },
  {
    name: "getFinanceAccounts",
    description: "List the user's active finance accounts with their ids. Use this to resolve an account name to its id.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "createTransaction",
    description:
      "Record a cash-in (money received) or cash-out (money spent) transaction against a finance account. Requires the accountId (from getFinanceAccounts, not the account name).",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        type: { type: "string", enum: ["IN", "OUT"], description: "IN = cash received, OUT = cash spent" },
        amount: { type: "number", description: "Positive amount" },
        category: { type: "string", description: "e.g. Salary, Utilities, Groceries" },
        description: { type: "string" },
        date: dateProp,
        time: timeProp,
        notes: { type: "string" },
      },
      required: ["accountId", "type", "amount", "date", "time"],
    },
  },
  {
    name: "updateTransaction",
    description: "Update fields on an existing transaction.",
    parameters: {
      type: "object",
      properties: {
        transactionId: { type: "string" },
        accountId: { type: "string" },
        type: { type: "string", enum: ["IN", "OUT"] },
        amount: { type: "number" },
        category: { type: "string" },
        description: { type: "string" },
        date: dateProp,
        time: timeProp,
        notes: { type: "string" },
      },
      required: ["transactionId"],
    },
  },
  {
    name: "deleteTransaction",
    description: "Permanently delete a transaction.",
    parameters: { type: "object", properties: { transactionId: { type: "string" } }, required: ["transactionId"] },
  },
  {
    name: "getTransactions",
    description: "List transactions, optionally filtered by account, type, category, or date range.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        type: { type: "string", enum: ["IN", "OUT"] },
        from: dateProp,
        to: dateProp,
        category: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "getFinancialSummary",
    description: "Get total cash in, cash out, net flow, and per-account balances, optionally within a date range.",
    parameters: {
      type: "object",
      properties: { from: dateProp, to: dateProp, accountId: { type: "string" } },
    },
  },
  {
    name: "getSpendingAnalysis",
    description: "Get a category-by-category spending breakdown and the single biggest expense in a date range.",
    parameters: {
      type: "object",
      properties: { from: dateProp, to: dateProp, accountId: { type: "string" } },
    },
  },
];

function str(args: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) throw ApiError.badRequest(`Missing required argument: ${key}`);
    return undefined;
  }
  if (typeof value !== "string") throw ApiError.badRequest(`Argument ${key} must be a string`);
  return value;
}

function num(args: Record<string, unknown>, key: string, required = false): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) throw ApiError.badRequest(`Missing required argument: ${key}`);
    return undefined;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) throw ApiError.badRequest(`Argument ${key} must be a number`);
  return n;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  return Boolean(value);
}

export async function executeAssistantTool(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "createTask": {
      const task = await taskService.createTask(userId, {
        title: str(args, "title", true)!,
        description: str(args, "description"),
        date: str(args, "date", true)!,
        time: str(args, "time", true)!,
        priority: str(args, "priority") as "low" | "medium" | "high" | undefined,
        category: str(args, "category"),
        reminder: { enabled: bool(args, "reminderEnabled") ?? false },
        recurrence: { type: str(args, "recurrenceType") as never },
        notes: str(args, "notes"),
      });
      return { id: String(task._id), title: task.title, date: task.date, time: task.time };
    }
    case "updateTask": {
      const taskId = str(args, "taskId", true)!;
      const task = await taskService.updateTask(userId, taskId, {
        title: str(args, "title"),
        description: str(args, "description"),
        date: str(args, "date"),
        time: str(args, "time"),
        priority: str(args, "priority") as "low" | "medium" | "high" | undefined,
        category: str(args, "category"),
        reminder: bool(args, "reminderEnabled") !== undefined ? { enabled: bool(args, "reminderEnabled") } : undefined,
        recurrence: str(args, "recurrenceType") ? { type: str(args, "recurrenceType") as never } : undefined,
        notes: str(args, "notes"),
      });
      return { id: String(task._id), title: task.title, date: task.date, time: task.time };
    }
    case "completeTask": {
      const taskId = str(args, "taskId", true)!;
      const task = await taskService.completeTask(userId, taskId, bool(args, "completed") ?? true);
      return { id: String(task._id), title: task.title, completed: task.completed };
    }
    case "deleteTask": {
      await taskService.deleteTask(userId, str(args, "taskId", true)!);
      return { deleted: true };
    }
    case "getTasks": {
      const tasks = await taskService.listTasks(userId, {
        status: (str(args, "status") as never) ?? "all",
        date: str(args, "date"),
        search: str(args, "search"),
        sort: "date_asc",
      });
      return tasks.map((t) => ({
        id: String(t._id),
        title: t.title,
        date: t.date,
        time: t.time,
        priority: t.priority,
        category: t.category,
        completed: t.completed,
      }));
    }
    case "createFinanceAccount": {
      const account = await financeService.createAccount(userId, {
        name: str(args, "name", true)!,
        description: str(args, "description"),
        type: str(args, "type"),
      });
      return { id: String(account._id), name: account.name, type: account.type };
    }
    case "getFinanceAccounts": {
      const accounts = await financeService.listAccounts(userId);
      return accounts.map((a) => ({ id: String(a._id), name: a.name, type: a.type }));
    }
    case "createTransaction": {
      const transaction = await financeService.createTransaction(userId, {
        accountId: str(args, "accountId", true)!,
        type: str(args, "type", true) as "IN" | "OUT",
        amount: num(args, "amount", true)!,
        category: str(args, "category"),
        description: str(args, "description"),
        date: str(args, "date", true)!,
        time: str(args, "time", true)!,
        notes: str(args, "notes"),
      });
      return { id: String(transaction._id), type: transaction.type, amount: transaction.amount, category: transaction.category };
    }
    case "updateTransaction": {
      const transactionId = str(args, "transactionId", true)!;
      const transaction = await financeService.updateTransaction(userId, transactionId, {
        accountId: str(args, "accountId"),
        type: str(args, "type") as "IN" | "OUT" | undefined,
        amount: num(args, "amount"),
        category: str(args, "category"),
        description: str(args, "description"),
        date: str(args, "date"),
        time: str(args, "time"),
        notes: str(args, "notes"),
      });
      return { id: String(transaction._id), type: transaction.type, amount: transaction.amount };
    }
    case "deleteTransaction": {
      await financeService.deleteTransaction(userId, str(args, "transactionId", true)!);
      return { deleted: true };
    }
    case "getTransactions": {
      const transactions = await financeService.listTransactions(userId, {
        accountId: str(args, "accountId"),
        type: str(args, "type") as "IN" | "OUT" | undefined,
        from: str(args, "from"),
        to: str(args, "to"),
        category: str(args, "category"),
        limit: num(args, "limit") ?? 25,
      });
      return transactions.map((t) => ({
        id: String(t._id),
        accountId: String(t.accountId),
        type: t.type,
        amount: t.amount,
        category: t.category,
        date: t.date,
      }));
    }
    case "getFinancialSummary": {
      const summary = await financeService.getFinancialSummary(userId, {
        from: str(args, "from"),
        to: str(args, "to"),
        accountId: str(args, "accountId"),
      });
      return {
        cashIn: summary.cashIn,
        cashOut: summary.cashOut,
        netFlow: summary.netFlow,
        accounts: summary.accounts,
      };
    }
    case "getSpendingAnalysis": {
      return financeService.getSpendingAnalysis(userId, {
        from: str(args, "from"),
        to: str(args, "to"),
        accountId: str(args, "accountId"),
      });
    }
    default:
      throw ApiError.badRequest(`Unknown tool: ${name}`);
  }
}
