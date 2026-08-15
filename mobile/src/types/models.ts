export interface User {
  id: string;
  mobileNumber: string;
  currency: string;
  timezone: string;
  notificationsEnabled: boolean;
  confirmFinancialActions: boolean;
  speakAssistantReplies: boolean;
  createdAt: string;
}

export type Priority = "low" | "medium" | "high";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "custom";

export interface Reminder {
  enabled: boolean;
  notifyAt: string | null;
  alarmEnabled: boolean;
  localNotificationId: string | null;
}

export interface Recurrence {
  type: RecurrenceType;
  interval: number;
  daysOfWeek?: number[];
  endDate: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  timezone: string;
  priority: Priority;
  category: string;
  completed: boolean;
  completedAt: string | null;
  reminder: Reminder;
  recurrence: Recurrence;
  notes: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCounts {
  pending: number;
  completed: number;
  overdue: number;
  total: number;
  dueToday: number;
}

export type AccountType =
  | "home"
  | "office"
  | "personal"
  | "travel"
  | "business"
  | "education"
  | "savings"
  | "custom";

export interface FinanceAccount {
  id: string;
  name: string;
  description: string;
  type: AccountType;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = "IN" | "OUT";

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string;
  time: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSummary {
  accountId: string;
  name: string;
  type: AccountType;
  cashIn: number;
  cashOut: number;
  balance: number;
}

export interface FinancialSummary {
  cashIn: number;
  cashOut: number;
  netFlow: number;
  transactionCount: number;
  accounts: AccountSummary[];
  recentTransactions: Transaction[];
}
