import { Task } from "../models/Task";
import { Transaction } from "../models/Transaction";
import { Message } from "../models/Message";
import { GroupExpense } from "../models/GroupExpense";
import { ExpenseGroup } from "../models/ExpenseGroup";
import { getFlags } from "../models/FeatureFlags";
import { ApiError } from "../utils/ApiError";
import { User } from "../models/User";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklySummary {
  rangeStart: string;
  rangeEnd: string;
  tasksCompleted: number;
  totalExpenses: number;
  upcomingReminders: number;
  groupExpensesTotal: number | null;
  unreadMessages: number | null;
  // Deliberately arithmetic, not AI — the brief mentions "AI insight" but no model is
  // involved here, so this is computed from the same numbers above and labelled as such.
  insight: string | null;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getWeeklySummary(userId: string): Promise<WeeklySummary> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  if (!user.weeklySummaryEnabled) {
    throw ApiError.badRequest("Turn on the weekly summary in Settings first");
  }

  const now = new Date();
  const start = new Date(now.getTime() - SEVEN_DAYS_MS);
  const rangeStart = toDateStr(start);
  const rangeEnd = toDateStr(now);

  const flags = await getFlags();

  const [tasksCompleted, expenses, upcomingReminders] = await Promise.all([
    Task.countDocuments({ userId, completed: true, completedAt: { $gte: start, $lte: now } }),
    Transaction.find({ userId, type: "OUT", date: { $gte: rangeStart, $lte: rangeEnd } }),
    Task.countDocuments({ userId, completed: false, "reminder.enabled": true, "reminder.notifyAt": { $gte: now } }),
  ]);

  const totalExpenses = expenses.reduce((sum, tx) => sum + tx.amount, 0);

  let groupExpensesTotal: number | null = null;
  if (flags.groupExpenses) {
    const groups = await ExpenseGroup.find({ $or: [{ createdBy: userId }, { members: userId }] }, { _id: 1 });
    const groupIds = groups.map((g) => g._id);
    const groupExpenses = await GroupExpense.find({
      groupId: { $in: groupIds },
      date: { $gte: rangeStart, $lte: rangeEnd },
    });
    groupExpensesTotal = groupExpenses.reduce((sum, e) => sum + e.amount, 0);
  }

  let unreadMessages: number | null = null;
  if (flags.chat) {
    unreadMessages = await Message.countDocuments({ toUserId: userId, readAt: null });
  }

  // Simple category breakdown from the same expense list, used only for the one insight line.
  const byCategory = new Map<string, number>();
  for (const tx of expenses) {
    byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + tx.amount);
  }
  let insight: string | null = null;
  if (byCategory.size > 0) {
    const [topCategory] = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
    insight = `Most spending was on ${topCategory[0]} (computed from this week's transactions)`;
  }

  return {
    rangeStart,
    rangeEnd,
    tasksCompleted,
    totalExpenses,
    upcomingReminders,
    groupExpensesTotal,
    unreadMessages,
    insight,
  };
}
