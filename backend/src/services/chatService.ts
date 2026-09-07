import { Message, type MessageDocument } from "../models/Message";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";

export async function sendMessage(fromUserId: string, toUserId: string, text: string): Promise<MessageDocument> {
  if (String(fromUserId) === String(toUserId)) {
    throw ApiError.badRequest("You can't message yourself");
  }
  const target = await User.exists({ _id: toUserId });
  if (!target) throw ApiError.notFound("User not found");

  return Message.create({ fromUserId, toUserId, text });
}

export async function listMessages(
  userId: string,
  withUserId: string,
  after?: string
): Promise<MessageDocument[]> {
  const query: Record<string, unknown> = {
    $or: [
      { fromUserId: userId, toUserId: withUserId },
      { fromUserId: withUserId, toUserId: userId },
    ],
  };
  if (after) {
    query.createdAt = { $gt: new Date(after) };
  }

  const [messages] = await Promise.all([
    Message.find(query).sort("createdAt"),
    Message.updateMany({ fromUserId: withUserId, toUserId: userId, readAt: null }, { readAt: new Date() }),
  ]);

  return messages;
}

interface ConversationSummary {
  userId: string;
  name: string;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const messages = await Message.find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }).sort("-createdAt");

  const byCounterpart = new Map<string, { last: MessageDocument; unread: number }>();

  for (const message of messages) {
    const counterpartId =
      String(message.fromUserId) === String(userId) ? String(message.toUserId) : String(message.fromUserId);

    let entry = byCounterpart.get(counterpartId);
    if (!entry) {
      entry = { last: message, unread: 0 };
      byCounterpart.set(counterpartId, entry);
    }

    const isUnreadIncoming =
      String(message.toUserId) === String(userId) && String(message.fromUserId) === counterpartId && !message.readAt;
    if (isUnreadIncoming) entry.unread += 1;
  }

  const counterpartIds = [...byCounterpart.keys()];
  const users = await User.find({ _id: { $in: counterpartIds } }).select("name");
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  const conversations: ConversationSummary[] = counterpartIds.map((id) => {
    const entry = byCounterpart.get(id)!;
    return {
      userId: id,
      name: nameById.get(id) ?? "Unknown",
      lastMessage: entry.last.text,
      lastMessageAt: entry.last.createdAt,
      unreadCount: entry.unread,
    };
  });

  conversations.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  return conversations;
}
