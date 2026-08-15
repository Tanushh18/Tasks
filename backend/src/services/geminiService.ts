import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface FunctionCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface FunctionResultInput {
  callId: string;
  name: string;
  result: unknown;
  isError?: boolean;
}

export interface InteractionResult {
  interactionId: string;
  outputText: string | null;
  functionCalls: FunctionCall[];
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.geminiApiKey) {
    throw new ApiError(
      503,
      "AI_NOT_CONFIGURED",
      "The AI assistant isn't set up yet. Add GEMINI_API_KEY to the backend .env file to enable it."
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return client;
}

function toGeminiTools(tools: ToolDeclaration[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function extractResult(interaction: {
  id: string;
  output_text?: string;
  steps: Array<{ type: string; [key: string]: unknown }>;
}): InteractionResult {
  const functionCalls: FunctionCall[] = interaction.steps
    .filter((step): step is { type: "function_call"; id: string; name: string; arguments: Record<string, unknown> } =>
      step.type === "function_call"
    )
    .map((step) => ({ callId: step.id, name: step.name, arguments: step.arguments }));

  return {
    interactionId: interaction.id,
    outputText: interaction.output_text ?? null,
    functionCalls,
  };
}

/** Starts a new turn (or continues an existing conversation via previousInteractionId) with a user text message. */
export async function sendUserMessage(params: {
  message: string;
  systemInstruction: string;
  tools: ToolDeclaration[];
  previousInteractionId?: string;
}): Promise<InteractionResult> {
  const interaction = await getClient().interactions.create({
    model: env.geminiModel,
    input: params.message,
    system_instruction: params.systemInstruction,
    tools: toGeminiTools(params.tools),
    ...(params.previousInteractionId ? { previous_interaction_id: params.previousInteractionId } : {}),
  });
  return extractResult(interaction);
}

/** Continues a turn by handing back the result(s) of tool call(s) the model requested. */
export async function sendFunctionResults(params: {
  results: FunctionResultInput[];
  tools: ToolDeclaration[];
  previousInteractionId: string;
}): Promise<InteractionResult> {
  const interaction = await getClient().interactions.create({
    model: env.geminiModel,
    previous_interaction_id: params.previousInteractionId,
    tools: toGeminiTools(params.tools),
    input: params.results.map((r) => ({
      type: "function_result" as const,
      call_id: r.callId,
      name: r.name,
      result: (r.result ?? {}) as Record<string, unknown>,
      ...(r.isError ? { is_error: true } : {}),
    })),
  });
  return extractResult(interaction);
}

export function isAiConfigured(): boolean {
  return Boolean(env.geminiApiKey);
}
