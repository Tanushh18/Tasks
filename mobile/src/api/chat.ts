import { apiClient } from "./client";

export interface Conversation {
  userId: string;
  name: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
  readAt: string | null;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<{ conversations: Conversation[] }>("/chat/conversations");
  return data.conversations;
}

export async function listMessages(withUserId: string, after?: string): Promise<ChatMessage[]> {
  const { data } = await apiClient.get<{ messages: ChatMessage[] }>(`/chat/messages/${withUserId}`, {
    params: after ? { after } : undefined,
  });
  return data.messages;
}

export async function sendMessage(withUserId: string, text: string): Promise<ChatMessage> {
  const { data } = await apiClient.post<{ message: ChatMessage }>(`/chat/messages/${withUserId}`, { text });
  return data.message;
}
