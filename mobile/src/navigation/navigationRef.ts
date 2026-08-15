import { createNavigationContainerRef } from "@react-navigation/native";
import type { MainTabParamList } from "./types";

export const navigationRef = createNavigationContainerRef<MainTabParamList>();

export function navigateToTask(taskId: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate("TasksTab", { screen: "TaskForm", params: { taskId } });
}
