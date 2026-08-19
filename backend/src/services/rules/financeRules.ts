import type { FinanceAccountDocument } from "../../models/FinanceAccount";
import * as financeService from "../financeService";
import { describeDate, parseRange, parseWhen } from "./datetime";
import { findAmount, formatCurrency, roundAmount } from "./numbers";
import { phrasesFor } from "./phrases";
import { blankSpans, capitalizeFirst, cleanPhrase, escapeRegex, truncate } from "./text";
import type { Locale, RuleContext, RuleOutcome } from "./types";

const CATEGORY_LIMIT = 60;
const ACCOUNT_NAME_LIMIT = 80;
const MAX_LISTED = 6;

const SPEND_WORDS =
  /\b(?:spent|spend|paid|pay|bought|buy|purchased|expense|expenses|cost|kharch|kharcha|kharche|diye|de\s+diye|lag\s+gaye|gaye|खर्च|दिए)\b/i;

const RECEIVE_WORDS =
  /\b(?:received|receive|got|earned|earn|income|salary|credited|refund|mila|mile|aaya|aaye|jama|मिला|मिले|जमा|आया)\b/i;

/** Question shapes — these must never be read as "record a transaction". */
const QUESTION_WORDS =
  /\b(?:how\s+much|how\s+many|what(?:'s| is| are)?|where|show|list|display|tell\s+me|give\s+me|summary|breakdown|report|total|balance|kitna|kitne|kitni|kahan|dikha|dikhao|batao|bata|kya|कितना|कितने|कहाँ|दिखाओ|बताओ)\b/i;

const SUMMARY_WORDS =
  /\b(?:summary|balance|net|overview|how\s+much.*(?:spent|spend|left|saved)|total|kharch\s+hua|kitna\s+kharch|kitna\s+bacha|खर्च\s+हुआ|बचा)\b/i;

const ANALYSIS_WORDS =
  /\b(?:breakdown|category|categories|where\s+(?:did|is).*(?:money|paisa)|biggest|highest|most\s+expensive|analysis|sabse\s+zyada|kis\s+pe|श्रेणी|सबसे\s+ज़्यादा)\b/i;

const TRANSACTION_WORDS =
  /\b(?:transactions?|expenses?|payments?|entries|spends|lenden|लेनदेन)\b/i;

const ACCOUNT_WORDS = /\b(?:accounts?|khata|khate|खाता|खाते)\b/i;

const CREATE_ACCOUNT_TRIGGERS: RegExp[] = [
  /\b(?:create|add|make|new|open)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:finance\s+)?(?:account|khata|खाता)\s*(?:called|named|for|ka|ke)?\s*(.*)$/i,
  /^(.+?)\s+(?:naam\s+ka\s+|naam\s+se\s+)?(?:account|khata|खाता)\s+(?:banao|bana\s+do|banaye|बनाओ)$/i,
];

/** Words that describe the money movement itself, never the category it belongs to. */
const CATEGORY_NOISE =
  /\b(?:spent|spend|paid|pay|bought|buy|purchased|expense|expenses|received|receive|got|earned|income|credited|kharch|kharcha|kharche|diye|gaye|mila|mile|aaya|aaye|jama|on|for|to|from|in|at|pe|par|ke\s+liye|ka|ki|ke|mein|me|se|ko|rupees?|rupaye|rupay|rs|inr|today|yesterday|aaj|kal|खर्च|दिए|मिला|जमा)\b/gi;

function findMentionedAccount(
  text: string,
  accounts: FinanceAccountDocument[]
): { account: FinanceAccountDocument; span: [number, number] } | null {
  // Longest name first so "Home Office" wins over "Home" when both exist.
  const sorted = [...accounts].sort((a, b) => b.name.length - a.name.length);
  for (const account of sorted) {
    const re = new RegExp(`\\b${escapeRegex(account.name.toLowerCase())}\\b`, "i");
    const match = text.match(re);
    if (match && match.index !== undefined) {
      return { account, span: [match.index, match.index + match[0].length] };
    }
  }
  return null;
}

/**
 * Rebuilds the "saved" wording after a confirmation round trip. By then the original parse is
 * gone — only the tool arguments come back from the client — so the account name is looked up
 * again rather than trusted from the request.
 */
export async function describeSavedTransaction(params: {
  userId: string;
  locale: Locale;
  currency: string;
  args: Record<string, unknown>;
}): Promise<{ reply: string; speech: string }> {
  const p = phrasesFor(params.locale);
  const accounts = await financeService.listAccounts(params.userId);
  const account = accounts.find((a) => String(a._id) === String(params.args.accountId));
  const rawAmount = Number(params.args.amount);
  const category = typeof params.args.category === "string" && params.args.category ? params.args.category : undefined;

  return {
    reply: p.transactionSaved({
      inflow: params.args.type === "IN",
      amount: formatCurrency(Number.isFinite(rawAmount) ? rawAmount : 0, params.currency),
      category,
      account: account?.name ?? "",
    }),
    speech: p.spokenSaved(),
  };
}

export async function matchFinanceIntent(ctx: RuleContext): Promise<RuleOutcome | null> {
  return (
    (await matchCreateAccount(ctx)) ??
    (await matchListAccounts(ctx)) ??
    (await matchSpendingAnalysis(ctx)) ??
    (await matchSummary(ctx)) ??
    (await matchListTransactions(ctx)) ??
    (await matchCreateTransaction(ctx))
  );
}

async function matchCreateAccount(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  if (!ACCOUNT_WORDS.test(ctx.text)) return null;

  for (const trigger of CREATE_ACCOUNT_TRIGGERS) {
    const match = ctx.text.match(trigger);
    if (!match) continue;

    const name = truncate(capitalizeFirst(cleanPhrase(match[1] ?? "")), ACCOUNT_NAME_LIMIT);
    // "create an account" with no name needs a follow-up question the LLM phrases better.
    if (!name) return null;

    return {
      kind: "action",
      call: { name: "createFinanceAccount", arguments: { name } },
      reply: p.accountCreated(name),
      speech: p.spokenSaved(),
    };
  }
  return null;
}

async function matchListAccounts(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  if (!ACCOUNT_WORDS.test(ctx.text) || !QUESTION_WORDS.test(ctx.text)) return null;
  // "how much is in my account" is a balance question, handled by the summary matcher.
  if (SUMMARY_WORDS.test(ctx.text) || /\bhow\s+much\b/i.test(ctx.text)) return null;

  const accounts = await financeService.listAccounts(ctx.userId);
  if (accounts.length === 0) {
    const reply = p.accountsEmpty();
    return { kind: "reply", reply, speech: reply };
  }

  const reply = p.accountsList(accounts.map((a) => a.name));
  return { kind: "reply", reply, speech: reply.split("\n")[0]! };
}

async function matchSummary(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  if (!QUESTION_WORDS.test(ctx.text)) return null;

  const moneyish = SUMMARY_WORDS.test(ctx.text) || SPEND_WORDS.test(ctx.text) || RECEIVE_WORDS.test(ctx.text);
  if (!moneyish) return null;

  const range = parseRange(ctx.text, ctx.now);
  const accounts = await financeService.listAccounts(ctx.userId);
  const mentioned = findMentionedAccount(ctx.text, accounts);

  const summary = await financeService.getFinancialSummary(ctx.userId, {
    from: range.from,
    to: range.to,
    accountId: mentioned ? String(mentioned.account._id) : undefined,
  });

  const reply = p.summary({
    inflow: formatCurrency(summary.cashIn, ctx.currency),
    outflow: formatCurrency(summary.cashOut, ctx.currency),
    net: formatCurrency(summary.netFlow, ctx.currency),
    range: capitalizeFirst(p.rangeLabel(range)),
  });
  return { kind: "reply", reply, speech: reply };
}

async function matchSpendingAnalysis(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  if (!ANALYSIS_WORDS.test(ctx.text)) return null;
  if (!QUESTION_WORDS.test(ctx.text) && !SPEND_WORDS.test(ctx.text)) return null;

  const range = parseRange(ctx.text, ctx.now);
  const accounts = await financeService.listAccounts(ctx.userId);
  const mentioned = findMentionedAccount(ctx.text, accounts);

  const analysis = await financeService.getSpendingAnalysis(ctx.userId, {
    from: range.from,
    to: range.to,
    accountId: mentioned ? String(mentioned.account._id) : undefined,
  });

  const rangeLabel = p.rangeLabel(range);
  if (analysis.categories.length === 0) {
    const reply = p.noSpending(rangeLabel);
    return { kind: "reply", reply, speech: reply };
  }

  const lines = analysis.categories
    .slice(0, MAX_LISTED)
    .map((c) => `• ${c.category}: ${formatCurrency(c.total, ctx.currency)}`);

  const biggest = analysis.biggestExpense
    ? `${formatCurrency(analysis.biggestExpense.amount, ctx.currency)} — ${analysis.biggestExpense.category}`
    : undefined;

  const reply = p.spending({ range: rangeLabel, lines, biggest });
  const speech = p.summary({
    inflow: formatCurrency(0, ctx.currency),
    outflow: formatCurrency(analysis.totalSpent, ctx.currency),
    net: formatCurrency(-analysis.totalSpent, ctx.currency),
    range: capitalizeFirst(rangeLabel),
  });
  return { kind: "reply", reply, speech };
}

async function matchListTransactions(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  if (!TRANSACTION_WORDS.test(ctx.text) || !QUESTION_WORDS.test(ctx.text)) return null;
  if (/\bhow\s+much\b/i.test(ctx.text)) return null;

  const range = parseRange(ctx.text, ctx.now);
  const accounts = await financeService.listAccounts(ctx.userId);
  const mentioned = findMentionedAccount(ctx.text, accounts);

  const type = RECEIVE_WORDS.test(ctx.text) && !SPEND_WORDS.test(ctx.text) ? "IN" : undefined;

  const transactions = await financeService.listTransactions(ctx.userId, {
    from: range.from,
    to: range.to,
    accountId: mentioned ? String(mentioned.account._id) : undefined,
    type,
    limit: 25,
  });

  const rangeLabel = p.rangeLabel(range);
  if (transactions.length === 0) {
    const reply = p.noSpending(rangeLabel);
    return { kind: "reply", reply, speech: reply };
  }

  const lines = transactions.slice(0, MAX_LISTED).map((t) => {
    const sign = t.type === "IN" ? "+" : "-";
    return `• ${sign}${formatCurrency(t.amount, ctx.currency)} — ${t.category} (${describeDate(t.date, ctx.now)})`;
  });

  const reply = p.transactionsList({ range: rangeLabel, lines, total: transactions.length });
  return { kind: "reply", reply, speech: reply.split("\n")[0]! };
}

async function matchCreateTransaction(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);

  const inflow = RECEIVE_WORDS.test(ctx.text);
  const outflow = SPEND_WORDS.test(ctx.text);
  if (!inflow && !outflow) return null;
  // A question about money is never a command to record money.
  if (QUESTION_WORDS.test(ctx.text)) return null;

  // Dates are stripped before the amount search so "spent 500 on 25 dec" doesn't read 25 as money.
  const when = parseWhen(ctx.text, ctx.now, { pastBias: true });
  const withoutWhen = blankSpans(ctx.text, when.spans);

  const amountMatch = findAmount(withoutWhen);
  if (!amountMatch) return null;

  const amount = roundAmount(amountMatch.amount);
  if (amount <= 0) return null;

  const accounts = await financeService.listAccounts(ctx.userId);
  if (accounts.length === 0) {
    const reply = p.accountNeededForTransaction();
    return { kind: "reply", reply, speech: reply };
  }

  const mentioned = findMentionedAccount(withoutWhen, accounts);
  let account = mentioned?.account;
  if (!account) {
    if (accounts.length === 1) account = accounts[0]!;
    else {
      const reply = p.whichAccount(accounts.map((a) => a.name));
      return { kind: "reply", reply, speech: reply.split("\n")[0]! };
    }
  }

  // Whatever text is left after removing the amount, date, account name and the verbs describing
  // the movement is the category ("spent 500 on groceries" → "Groceries").
  const spans: Array<[number, number]> = [[amountMatch.start, amountMatch.end]];
  if (mentioned) spans.push(mentioned.span);
  const leftover = blankSpans(withoutWhen, spans).replace(CATEGORY_NOISE, " ");
  const category = truncate(capitalizeFirst(cleanPhrase(leftover)), CATEGORY_LIMIT);

  const date = when.date ?? ctx.now.toISODate()!;
  const time = when.time ?? ctx.now.toFormat("HH:mm");
  const formattedAmount = formatCurrency(amount, ctx.currency);
  const isInflow = inflow && !outflow;

  return {
    kind: "action",
    call: {
      name: "createTransaction",
      arguments: {
        accountId: String(account._id),
        type: isInflow ? "IN" : "OUT",
        amount,
        date,
        time,
        ...(category ? { category } : {}),
      },
    },
    reply: p.transactionSaved({
      inflow: isInflow,
      amount: formattedAmount,
      category: category || undefined,
      account: account.name,
    }),
    speech: p.spokenSaved(),
    confirm: {
      reply: p.transactionConfirm({
        inflow: isInflow,
        amount: formattedAmount,
        category: category || undefined,
        account: account.name,
      }),
      speech: p.transactionConfirm({
        inflow: isInflow,
        amount: formattedAmount,
        category: category || undefined,
        account: account.name,
      }),
    },
  };
}
