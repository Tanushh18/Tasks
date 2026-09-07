import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as chatService from "../services/chatService";
import type { MessageDocument } from "../models/Message";

function serializeMessage(message: MessageDocument) {
  return {
    id: String(message._id),
    fromUserId: String(message.fromUserId),
    toUserId: String(message.toUserId),
    text: message.text,
    readAt: message.readAt,
    createdAt: message.createdAt,
  };
}

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const conversations = await chatService.listConversations(req.userId!);
  res.json({ conversations });
});

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const { withUserId } = req.params as { withUserId: string };
  const { after } = req.query as { after?: string };
  const messages = await chatService.listMessages(req.userId!, withUserId, after);
  res.json({ messages: messages.map(serializeMessage) });
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { withUserId } = req.params as { withUserId: string };
  const { text } = req.body as { text: string };
  const message = await chatService.sendMessage(req.userId!, withUserId, text);
  res.status(201).json({ message: serializeMessage(message) });
});
