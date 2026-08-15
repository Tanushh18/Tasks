import { apiClient } from "./client";

export interface PendingAction {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantTurnResult {
  reply: string;
  interactionId: string;
  pendingAction: PendingAction | null;
}

export async function sendAssistantMessage(message: string, previousInteractionId?: string): Promise<AssistantTurnResult> {
  const { data } = await apiClient.post<AssistantTurnResult>("/assistant/message", { message, previousInteractionId });
  return data;
}

export async function respondToConfirmation(params: {
  interactionId: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  confirmed: boolean;
}): Promise<AssistantTurnResult> {
  const { data } = await apiClient.post<AssistantTurnResult>("/assistant/confirm", params);
  return data;
}
