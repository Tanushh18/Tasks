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
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
  ChangeMpin: undefined;
  PendingScans: undefined;
};

export type ContactsStackParamList = {
  ContactsList: undefined;
  ContactForm: { contactId?: string } | undefined;
};

export type ChatStackParamList = {
  ChatList: undefined;
  ChatThread: { userId: string; name: string };
  BluetoothChat: undefined;
};

export type AdminStackParamList = {
  AdminUsers: undefined;
};

export type NotesStackParamList = {
  NotesList: undefined;
  NoteForm: { noteId?: string; type?: "text" | "checklist" } | undefined;
};

export type MoreStackParamList = {
  MoreMain: undefined;
  Assistant: { autoListen?: boolean } | undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
  LocationSharing: undefined;
  Notes: NavigatorScreenParams<NotesStackParamList>;
  AdminUsers: undefined;
  FeatureFlags: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  TasksTab: NavigatorScreenParams<TasksStackParamList>;
  FinanceTab: NavigatorScreenParams<FinanceStackParamList>;
  ContactsTab: NavigatorScreenParams<ContactsStackParamList>;
  ChatTab: NavigatorScreenParams<ChatStackParamList>;
  MoreTab: NavigatorScreenParams<MoreStackParamList>;
};
