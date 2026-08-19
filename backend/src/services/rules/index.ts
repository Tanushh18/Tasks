import { DateTime } from "luxon";
import { matchFinanceIntent } from "./financeRules";
import { phrasesFor } from "./phrases";
import { matchTaskIntent } from "./taskRules";
import { detectLocale, normalize } from "./text";
import type { RuleContext, RuleOutcome } from "./types";

export type { Locale, RuleContext, RuleOutcome, RuleToolCall } from "./types";
export { phrasesFor } from "./phrases";
export { detectLocale } from "./text";
export { describeSavedTransaction } from "./financeRules";

/** Anything the user could plausibly be asking this app about. Its presence vetoes the
 * out-of-scope check, so "what's the weather like for my 5pm task" is not rejected outright. */
const APP_KEYWORDS =
  /\b(?:task|tasks|todo|to-?do|reminder|reminders|alarm|expense|expenses|spent|spend|spending|paid|money|budget|account|accounts|balance|transaction|transactions|income|salary|kaam|kharch|kharcha|khata|khate|paisa|paise|yaad|lenden|कार्य|काम|खर्च|खाता|याद|पैसे|लेनदेन)\b/i;

/** Deliberately narrow: only unmistakable general-knowledge/chit-chat topics. Anything less
 * clear-cut goes to the LLM, which can decline more gracefully than a regex. */
const OUT_OF_SCOPE =
  /\b(?:weather|mausam|temperature|forecast|barish|news|khabar|headlines|joke|jokes|chutkula|cricket|football|ipl|scorecard|movie|film|song|gaana|lyrics|recipe|translate|meaning\s+of|capital\s+of|who\s+is|who\s+was|president|prime\s+minister|stock\s+price|share\s+price|bitcoin|crypto|write\s+(?:me\s+)?(?:a\s+)?(?:code|program|essay|poem|story)|python|javascript|sql)\b/i;

const GREETING = /^(?:hi+|hello+|hey+|helo|yo|hola|namaste|namaskar|good\s+(?:morning|afternoon|evening)|gm|ge|नमस्ते|नमस्कार)\b/i;

const THANKS = /\b(?:thanks|thank\s+you|thankyou|thx|ty|shukriya|dhanyavaad|dhanyawad|धन्यवाद|शुक्रिया)\b/i;

const HELP =
  /\b(?:help|what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+do\s+i\s+use|commands|capabilities|kya\s+kar\s+sakte|madad|मदद|क्या\s+कर\s+सकते)\b/i;

export interface ParseCommandParams {
  userId: string;
  message: string;
  timezone: string;
  currency: string;
}

/**
 * Tries to answer a message with rules alone.
 *
 * Returns `null` when nothing matches confidently — the caller then falls back to the LLM. That
 * boundary is the whole point: everyday commands cost nothing and always work, while unusual
 * phrasing still gets a real model behind it.
 */
export async function parseCommand(params: ParseCommandParams): Promise<RuleOutcome | null> {
  const locale = detectLocale(params.message);
  const ctx: RuleContext = {
    userId: params.userId,
    locale,
    timezone: params.timezone,
    currency: params.currency,
    text: normalize(params.message),
    raw: params.message,
    now: DateTime.now().setZone(params.timezone),
  };

  if (!ctx.text) return null;

  const smallTalk = matchSmallTalk(ctx);
  if (smallTalk) return smallTalk;

  // Finance runs first: "create account Home" would otherwise be swallowed by the generic
  // "create ..." task trigger.
  const finance = await matchFinanceIntent(ctx);
  if (finance) return finance;

  const task = await matchTaskIntent(ctx);
  if (task) return task;

  if (OUT_OF_SCOPE.test(ctx.text) && !APP_KEYWORDS.test(ctx.text)) {
    const reply = phrasesFor(locale).outOfScope();
    return { kind: "reply", reply, speech: reply };
  }

  return null;
}

function matchSmallTalk(ctx: RuleContext): RuleOutcome | null {
  const p = phrasesFor(ctx.locale);
  const wordCount = ctx.text.split(/\s+/).length;

  if (HELP.test(ctx.text) && wordCount <= 8) {
    const reply = p.help();
    return { kind: "reply", reply, speech: reply.split("\n")[0]! };
  }

  // A greeting only counts on its own — "hi, remind me to call mom" is a command.
  if (GREETING.test(ctx.text) && wordCount <= 4) {
    const reply = p.greeting();
    return { kind: "reply", reply, speech: reply };
  }

  if (THANKS.test(ctx.text) && wordCount <= 4) {
    const reply = p.thanks();
    return { kind: "reply", reply, speech: reply };
  }

  return null;
}
