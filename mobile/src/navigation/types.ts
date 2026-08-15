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
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  TasksTab: NavigatorScreenParams<TasksStackParamList>;
  FinanceTab: NavigatorScreenParams<FinanceStackParamList>;
  AssistantTab: { autoListen?: boolean } | undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};
