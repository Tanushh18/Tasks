import type { DateTime } from "luxon";

/** Which language/script the user wrote in, so replies can come back in the same one. */
export type Locale = "en" | "hi" | "hinglish";

export interface RuleToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** A turn the rule engine fully answered by itself — no mutation to run, nothing to confirm.
 * Covers greetings, help, "not found", clarifying questions and read-only answers (the engine
 * queries the services directly rather than round-tripping through a tool call). */
export interface RuleReplyOutcome {
  kind: "reply";
  reply: string;
  speech: string;
}

/** A mutation the rule engine resolved completely (ids already looked up) and wants executed.
 * `confirm` is used instead of `reply` when the action needs the user's go-ahead first — the
 * caller decides, since that depends on the user's confirmFinancialActions setting. */
export interface RuleActionOutcome {
  kind: "action";
  call: RuleToolCall;
  reply: string;
  speech: string;
  confirm?: { reply: string; speech: string };
}

export type RuleOutcome = RuleReplyOutcome | RuleActionOutcome;

export interface RuleContext {
  userId: string;
  locale: Locale;
  timezone: string;
  currency: string;
  /** Lowercased, digit-normalized, whitespace-collapsed message — what the matchers scan. */
  text: string;
  /** The message exactly as the user sent it, for echoing titles back with original casing. */
  raw: string;
  now: DateTime;
}
