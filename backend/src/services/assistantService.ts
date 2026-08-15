import { DateTime } from "luxon";
import { User, type UserDocument } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { assistantTools, CONFIRMATION_REQUIRED_TOOLS, executeAssistantTool } from "./assistantTools";
import * as financeService from "./financeService";
import {
  isAiConfigured,
  sendFunctionResults,
  sendUserMessage,
  type FunctionCall,
  type FunctionResultInput,
  type InteractionResult,
} from "./geminiService";

const MAX_TOOL_ROUNDS = 5;

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

async function buildSystemInstruction(userId: string, user: UserDocument): Promise<string> {
  const now = DateTime.now().setZone(user.timezone);
  const accounts = await financeService.listAccounts(userId);
  const accountList = accounts.length
    ? accounts.map((a) => `- ${a.name} (id: ${a._id}, type: ${a.type})`).join("\n")
    : "(the user has no finance accounts yet — offer to create one if they want to log a transaction)";

  return [
    "You are a helpful personal assistant inside a tasks, reminders and personal finance app.",
    `The current date and time is ${now.toFormat("cccc, LLLL d, yyyy 'at' HH:mm")} (timezone ${user.timezone}). The user's currency is ${user.currency}.`,
    "Use the provided tools to fulfil requests about tasks, reminders and finances. Never claim to have done something without calling the matching tool first.",
    "When a request needs a taskId or transactionId you don't already have, call getTasks or getTransactions first to find it — do not guess ids.",
    "The user's finance accounts are:",
    accountList,
    "When calling any finance tool that needs an accountId, use the id from that list exactly — never invent one or pass the account name as the id.",
    "If a transaction command doesn't clearly specify which account to use and the user has more than one account, do not guess: ask the user which account in a plain text reply instead of calling a tool.",
    "Convert relative dates and times (e.g. 'tomorrow at 8pm', 'in 7 days', 'next Monday') into exact date (YYYY-MM-DD) and time (HH:mm) values yourself before calling a tool, using the current date above.",
    "Keep replies short, friendly and specific — state amounts, dates and titles plainly rather than vaguely.",
  ].join("\n");
}

function describeProposedAction(name: string, args: Record<string, unknown>): string {
  if (name === "createTransaction") {
    const kind = args.type === "IN" ? "cash-in" : "cash-out";
    const category = typeof args.category === "string" && args.category ? ` (${args.category})` : "";
    return `I'd like to save a ${kind} transaction of ${args.amount}${category}. Should I save it?`;
  }
  if (name === "updateTransaction") return "I'd like to update that transaction. Should I save the changes?";
  if (name === "deleteTransaction") return "I'd like to permanently delete that transaction. This can't be undone — should I go ahead?";
  return "Should I go ahead with that?";
}

async function runToolCall(userId: string, call: FunctionCall): Promise<FunctionResultInput> {
  try {
    const toolResult = await executeAssistantTool(userId, call.name, call.arguments);
    return { callId: call.callId, name: call.name, result: toolResult };
  } catch (err) {
    return {
      callId: call.callId,
      name: call.name,
      result: { error: err instanceof ApiError ? err.message : "This action could not be completed." },
      isError: true,
    };
  }
}

/** Drives the function-call round trip until the model produces a final text reply, a financial
 * action needs confirmation, or the round limit is hit. Shared by fresh turns and confirmation resumes. */
async function driveToolLoop(userId: string, requireConfirmation: boolean, initial: InteractionResult): Promise<AssistantTurnResult> {
  let result = initial;

  for (let round = 0; round < MAX_TOOL_ROUNDS && result.functionCalls.length > 0; round++) {
    if (requireConfirmation) {
      const pending = result.functionCalls.find((call) => CONFIRMATION_REQUIRED_TOOLS.has(call.name));
      if (pending) {
        return {
          reply: result.outputText ?? describeProposedAction(pending.name, pending.arguments),
          interactionId: result.interactionId,
          pendingAction: { callId: pending.callId, name: pending.name, arguments: pending.arguments },
        };
      }
    }

    const functionResults = await Promise.all(result.functionCalls.map((call) => runToolCall(userId, call)));
    result = await sendFunctionResults({ results: functionResults, tools: assistantTools, previousInteractionId: result.interactionId });
  }

  return { reply: result.outputText ?? "Done.", interactionId: result.interactionId, pendingAction: null };
}

export async function runAssistantTurn(params: {
  userId: string;
  message: string;
  previousInteractionId?: string;
}): Promise<AssistantTurnResult> {
  if (!isAiConfigured()) {
    throw new ApiError(
      503,
      "AI_NOT_CONFIGURED",
      "The AI assistant isn't set up yet. Add GEMINI_API_KEY to the backend .env file to enable it."
    );
  }

  const user = await User.findById(params.userId);
  if (!user) throw ApiError.notFound("User not found");

  const systemInstruction = await buildSystemInstruction(params.userId, user);
  const initial = await sendUserMessage({
    message: params.message,
    systemInstruction,
    tools: assistantTools,
    previousInteractionId: params.previousInteractionId,
  });

  return driveToolLoop(params.userId, user.confirmFinancialActions, initial);
}

export async function confirmAssistantAction(params: {
  userId: string;
  interactionId: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  confirmed: boolean;
}): Promise<AssistantTurnResult> {
  const user = await User.findById(params.userId);
  if (!user) throw ApiError.notFound("User not found");

  const functionResult: FunctionResultInput = params.confirmed
    ? await runToolCall(params.userId, { callId: params.callId, name: params.name, arguments: params.arguments })
    : {
        callId: params.callId,
        name: params.name,
        result: { cancelled: true, message: "The user declined this action; it was not saved." },
      };

  const initial = await sendFunctionResults({
    results: [functionResult],
    tools: assistantTools,
    previousInteractionId: params.interactionId,
  });

  const outcome = await driveToolLoop(params.userId, user.confirmFinancialActions, initial);
  if (outcome.reply === "Done." && !params.confirmed) {
    outcome.reply = "No problem, I won't save that.";
  }
  return outcome;
}
