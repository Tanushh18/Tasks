import type { Request, Response } from "express";
import { confirmAssistantAction, runAssistantTurn } from "../services/assistantService";
import { asyncHandler } from "../utils/asyncHandler";

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { message, previousInteractionId } = req.body as { message: string; previousInteractionId?: string };
  const result = await runAssistantTurn({ userId: req.userId!, message, previousInteractionId });
  res.json(result);
});

export const respondToConfirmation = asyncHandler(async (req: Request, res: Response) => {
  const { interactionId, callId, name, arguments: args, confirmed } = req.body as {
    interactionId: string;
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
    confirmed: boolean;
  };
  const result = await confirmAssistantAction({ userId: req.userId!, interactionId, callId, name, arguments: args, confirmed });
  res.json(result);
});
