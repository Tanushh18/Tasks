import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Search: undefined;
};

export type TasksStackParamList = {
  TaskList: undefined;
  TaskForm: { taskId?: string; initialDate?: string } | undefined;
  Calendar: undefined;
};

export type FinanceStackParamList = {
  AccountsList: undefined;
  AccountDetail: { accountId: string };
  AccountForm: { accountId?: string } | undefined;
  TransactionForm: { accountId?: string; transactionId?: string; type?: "IN" | "OUT" } | undefined;
  Insights: undefined;
  GroupsList: undefined;
  GroupForm: { groupId?: string } | undefined;
  GroupDetail: { groupId: string; name: string };
  GroupExpenseForm: { groupId: string; expenseId?: string };
  GroupSettleForm: { groupId: string; fromUserId?: string; toUserId?: string; amount?: number };
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
  ChangeMpin: undefined;
  PendingScans: undefined;
};

export type ContactsStackParamList = {
  ContactsList: undefined;
  ContactForm: { contactId?: string } | undefined;
  ContactImport: undefined;
};

export type ChatStackParamList = {
  ChatList: undefined;
  ChatThread: { userId: string; name: string };
  BluetoothChat: undefined;
};

/**
 * Contacts, chat and location live in one "Family" stack — the bottom bar is
 * organised around people and purpose, not around one tab per module (§3).
 * The older ContactsStackParamList / ChatStackParamList remain as the shape
 * those individual screens still expect for their own params.
 */
export type FamilyStackParamList = {
  FamilyHub: undefined;
  ContactsList: undefined;
  ContactForm: { contactId?: string } | undefined;
  ContactImport: undefined;
  ChatList: undefined;
  ChatThread: { userId: string; name: string };
  BluetoothChat: undefined;
  LocationSharing: undefined;
};

export type AdminStackParamList = {
  AdminUsers: undefined;
};

export type NotesStackParamList = {
  NotesList: undefined;
  NoteForm: { noteId?: string; type?: "text" | "checklist" } | undefined;
};

export type VaultStackParamList = {
  VaultList: undefined;
  VaultForm: { documentId?: string } | undefined;
};

export type InventoryStackParamList = {
  InventoryList: undefined;
  InventoryForm: { itemId?: string } | undefined;
};

export type EmergencyStackParamList = {
  EmergencyInfoMain: undefined;
};

export type MoreStackParamList = {
  MoreMain: undefined;
  Assistant: { autoListen?: boolean } | undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
  Notes: NavigatorScreenParams<NotesStackParamList>;
  Vault: NavigatorScreenParams<VaultStackParamList>;
  Inventory: NavigatorScreenParams<InventoryStackParamList>;
  EmergencyInfo: NavigatorScreenParams<EmergencyStackParamList>;
  AdminUsers: undefined;
  FeatureFlags: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  TasksTab: NavigatorScreenParams<TasksStackParamList>;
  FinanceTab: NavigatorScreenParams<FinanceStackParamList>;
  FamilyTab: NavigatorScreenParams<FamilyStackParamList>;
  MoreTab: NavigatorScreenParams<MoreStackParamList>;
};
