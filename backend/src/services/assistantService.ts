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
  /** Short, crisp text meant for text-to-speech — deliberately not the same as `reply`, which can
   * be as detailed as the model likes. See `deriveSpeech` below. */
  speech: string;
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
    "You are a focused assistant built into this tasks, reminders and personal finance app — not a general-purpose chatbot.",
    "SCOPE: only help with the user's tasks, reminders, finances inside this app, and questions about how to use this app. " +
      "If the user asks anything outside that (general knowledge, news, other apps, coding help, opinions, etc.), decline in one short sentence and redirect them to what you can help with here. Do not answer out-of-scope questions even if you know the answer.",
    "STYLE: keep every reply crisp and concise — one or two short sentences, plain and specific (state the actual title, date, time or amount). No filler, no restating the user's request back to them, no long explanations unless they explicitly ask for detail.",
    "LANGUAGE: the user may write or speak in English, Hindi (Devanagari script), or Hinglish (Hindi words in Latin letters). Understand the request in whichever of these they use, and reply in the same language and script as their latest message.",
    `The current date and time is ${now.toFormat("cccc, LLLL d, yyyy 'at' HH:mm")} (timezone ${user.timezone}). The user's currency is ${user.currency}.`,
    "Use the provided tools to fulfil requests about tasks, reminders and finances. Never claim to have done something without calling the matching tool first.",
    "When a request needs a taskId or transactionId you don't already have, call getTasks or getTransactions first to find it — do not guess ids.",
    "The user's finance accounts are:",
    accountList,
    "When calling any finance tool that needs an accountId, use the id from that list exactly — never invent one or pass the account name as the id.",
    "If a transaction command doesn't clearly specify which account to use and the user has more than one account, do not guess: ask the user which account in a plain text reply instead of calling a tool.",
    "Convert relative dates and times (e.g. 'tomorrow at 8pm', 'in 7 days', 'next Monday') into exact date (YYYY-MM-DD) and time (HH:mm) values yourself before calling a tool, using the current date above.",
  ].join("\n");
}

const READ_ONLY_TOOLS = new Set([
  "getTasks",
  "getFinanceAccounts",
  "getTransactions",
  "getFinancialSummary",
  "getSpendingAnalysis",
]);

function isHindiScript(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}

const SPOKEN_CONFIRMATIONS_EN: Record<string, (args: Record<string, unknown>) => string> = {
  createTask: () => "Okay, I've added the task.",
  updateTask: () => "Okay, I've updated the task.",
  deleteTask: () => "Done, the task is deleted.",
  completeTask: (args) => (args.completed === false ? "Okay, marked as not done." : "Okay, marked as done."),
  createFinanceAccount: () => "Okay, I've created the account.",
  createTransaction: () => "Okay, I've saved that transaction.",
  updateTransaction: () => "Okay, I've updated the transaction.",
  deleteTransaction: () => "Done, the transaction is deleted.",
};

const SPOKEN_CONFIRMATIONS_HI: Record<string, (args: Record<string, unknown>) => string> = {
  createTask: () => "ठीक है, कार्य जोड़ दिया गया है।",
  updateTask: () => "ठीक है, कार्य अपडेट कर दिया गया है।",
  deleteTask: () => "ठीक है, कार्य हटा दिया गया है।",
  completeTask: (args) => (args.completed === false ? "ठीक है, इसे अधूरा कर दिया गया है।" : "ठीक है, यह पूरा हो गया है।"),
  createFinanceAccount: () => "ठीक है, खाता बना दिया गया है।",
  createTransaction: () => "ठीक है, लेनदेन सेव कर दिया गया है।",
  updateTransaction: () => "ठीक है, लेनदेन अपडेट कर दिया गया है।",
  deleteTransaction: () => "ठीक है, लेनदेन हटा दिया गया है।",
};

/** A short first sentence of the reply, capped in length — used for TTS when there's no
 * completed action to confirm (a plain answer or a clarifying question). Never reads the whole
 * reply verbatim; that's what the on-screen text is for. */
function crispSpeechFallback(reply: string): string {
  const firstSentence = reply.split(/(?<=[.!?।])\s+/)[0]?.trim() || reply.trim();
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence;
}

/** Computes what should be spoken aloud, deliberately independent of the (potentially detailed)
 * on-screen reply text — e.g. the reply might say "Adding a reminder for the electricity bill on
 * 19 Aug at 8:00 PM" while speech stays "Okay, I've added the task." Driven by which tool actually
 * ran, not by asking the model to write two versions of the same thing. */
function deriveSpeech(reply: string, lastMutation: { name: string; args: Record<string, unknown> } | null): string {
  const hindi = isHindiScript(reply);
  if (lastMutation) {
    const table = hindi ? SPOKEN_CONFIRMATIONS_HI : SPOKEN_CONFIRMATIONS_EN;
    const build = table[lastMutation.name];
    if (build) return build(lastMutation.args);
  }
  return crispSpeechFallback(reply);
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

interface MutationRecord {
  name: string;
  args: Record<string, unknown>;
}

/** Drives the function-call round trip until the model produces a final text reply, a financial
 * action needs confirmation, or the round limit is hit. Shared by fresh turns and confirmation
 * resumes — `seedMutation` lets a confirmation resume carry in the action that already ran before
 * this loop started, so `speech` reflects it even if the model calls no further tools. */
async function driveToolLoop(
  userId: string,
  requireConfirmation: boolean,
  initial: InteractionResult,
  seedMutation: MutationRecord | null = null
): Promise<AssistantTurnResult> {
  let result = initial;
  let lastMutation: MutationRecord | null = seedMutation;

  for (let round = 0; round < MAX_TOOL_ROUNDS && result.functionCalls.length > 0; round++) {
    if (requireConfirmation) {
      const pending = result.functionCalls.find((call) => CONFIRMATION_REQUIRED_TOOLS.has(call.name));
      if (pending) {
        const reply = result.outputText ?? describeProposedAction(pending.name, pending.arguments);
        return {
          reply,
          // Nothing new completed just now — speak the confirmation question itself, never a
          // stale "done" phrase left over from an earlier mutation in this same turn.
          speech: crispSpeechFallback(reply),
          interactionId: result.interactionId,
          pendingAction: { callId: pending.callId, name: pending.name, arguments: pending.arguments },
        };
      }
    }

    const functionResults = await Promise.all(result.functionCalls.map((call) => runToolCall(userId, call)));
    for (const call of result.functionCalls) {
      const outcome = functionResults.find((r) => r.callId === call.callId);
      if (outcome && !outcome.isError && !READ_ONLY_TOOLS.has(call.name)) {
        lastMutation = { name: call.name, args: call.arguments };
      }
    }
    result = await sendFunctionResults({ results: functionResults, tools: assistantTools, previousInteractionId: result.interactionId });
  }

  const reply = result.outputText ?? "Done.";
  return { reply, speech: deriveSpeech(reply, lastMutation), interactionId: result.interactionId, pendingAction: null };
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

  const seedMutation: MutationRecord | null =
    params.confirmed && !functionResult.isError ? { name: params.name, args: params.arguments } : null;

  const initial = await sendFunctionResults({
    results: [functionResult],
    tools: assistantTools,
    previousInteractionId: params.interactionId,
  });

  const outcome = await driveToolLoop(params.userId, user.confirmFinancialActions, initial, seedMutation);
  if (outcome.reply === "Done." && !params.confirmed) {
    outcome.reply = "No problem, I won't save that.";
    outcome.speech = outcome.reply;
  }
  return outcome;
}
