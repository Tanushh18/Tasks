import { normalize } from "./text";

export interface AmountMatch {
  amount: number;
  start: number;
  end: number;
}

/** Scale words, including the Indian ones people actually type/say in this app. */
const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  thousands: 1_000,
  hazaar: 1_000,
  hazar: 1_000,
  hajaar: 1_000,
  hajar: 1_000,
  sau: 100,
  hundred: 100,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakhon: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  cr: 10_000_000,
  karod: 10_000_000,
  million: 1_000_000,
  mn: 1_000_000,
};

const MULTIPLIER_PATTERN = Object.keys(MULTIPLIERS)
  .sort((a, b) => b.length - a.length)
  .join("|");

const CURRENCY_PREFIX = String.raw`(?:₹|rs\.?|inr\b|rupees?\b|rupaye\b|rupay\b)`;
const CURRENCY_SUFFIX = String.raw`(?:₹|rs\.?\b|inr\b|rupees?\b|rupaye\b|rupay\b|\/-)`;

/**
 * Digit amounts with optional currency markers and scale words:
 * `₹500`, `Rs. 1,50,000`, `500/-`, `5k`, `2.5 lakh`, `1 crore`.
 * Commas are stripped afterwards so both `50,000` and Indian `1,50,000` grouping work.
 */
const DIGIT_AMOUNT = new RegExp(
  String.raw`(${CURRENCY_PREFIX})?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(${MULTIPLIER_PATTERN})?\s*(${CURRENCY_SUFFIX})?`,
  "gi"
);

const WORD_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Hindi / Hinglish
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, che: 6, chah: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unnees: 19, bees: 20, pachees: 25, tees: 30, chalis: 40,
  chalees: 40, pachas: 50, pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
};

const WORD_SCALES: Record<string, number> = {
  hundred: 100, sau: 100,
  thousand: 1_000, hazaar: 1_000, hazar: 1_000, hajaar: 1_000, hajar: 1_000,
  lakh: 100_000, lakhs: 100_000, lac: 100_000,
  million: 1_000_000,
  crore: 10_000_000, crores: 10_000_000, karod: 10_000_000,
};

/**
 * Composes spelled-out numbers: "five hundred" → 500, "two thousand five hundred" → 2500,
 * "paanch sau" → 500, "do hazaar" → 2000. Returns null if the run contains no number words.
 */
function composeWordNumber(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let sawAny = false;

  for (const token of tokens) {
    const unit = WORD_UNITS[token];
    const scale = WORD_SCALES[token];

    if (unit !== undefined) {
      current += unit;
      sawAny = true;
    } else if (scale !== undefined) {
      // A scale with nothing before it means "one of them" — "sau rupaye" = 100.
      current = (current === 0 ? 1 : current) * scale;
      sawAny = true;
      if (scale >= 1_000) {
        total += current;
        current = 0;
      }
    } else if (token === "and" || token === "aur") {
      continue;
    } else {
      return null;
    }
  }

  if (!sawAny) return null;
  return total + current;
}

const WORD_NUMBER_TOKEN = new RegExp(
  `\\b(?:${[...Object.keys(WORD_UNITS), ...Object.keys(WORD_SCALES), "and", "aur"]
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "gi"
);

/** Finds the longest run of adjacent spelled-out number words and evaluates it. */
function findWordAmount(text: string): AmountMatch | null {
  const matches = [...text.matchAll(WORD_NUMBER_TOKEN)];
  if (matches.length === 0) return null;

  let best: AmountMatch | null = null;
  let runStart = -1;
  let runEnd = -1;
  let runTokens: string[] = [];

  const flush = () => {
    if (runTokens.length === 0) return;
    const value = composeWordNumber(runTokens);
    if (value !== null && value > 0 && (best === null || value > best.amount)) {
      best = { amount: value, start: runStart, end: runEnd };
    }
    runTokens = [];
  };

  for (const match of matches) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // Adjacent means separated only by spaces — "five hundred" continues a run, "five apples
    // hundred" does not.
    const gap = runEnd >= 0 ? text.slice(runEnd, start) : null;
    if (gap !== null && /^\s*$/.test(gap)) {
      runEnd = end;
      runTokens.push(match[0].toLowerCase());
    } else {
      flush();
      runStart = start;
      runEnd = end;
      runTokens = [match[0].toLowerCase()];
    }
  }
  flush();

  return best;
}

/**
 * Extracts a money amount. Candidates carrying a currency marker (`₹500`) or a scale word (`5k`)
 * outrank a bare number, so "add 2 tasks for 500 rupees" picks 500 rather than 2. Pass
 * `requireMarker` when the text still contains unrelated digits (dates, counts) and only an
 * explicitly marked amount should count.
 */
export function findAmount(text: string, options: { requireMarker?: boolean } = {}): AmountMatch | null {
  const candidates: Array<AmountMatch & { score: number }> = [];

  for (const match of text.matchAll(DIGIT_AMOUNT)) {
    const [full, prefix, digits, multiplier, suffix] = match;
    if (!digits) continue;

    const base = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;

    const scale = multiplier ? MULTIPLIERS[multiplier.toLowerCase()] ?? 1 : 1;
    const amount = base * scale;
    if (amount <= 0) continue;

    const hasMarker = Boolean(prefix || suffix || multiplier);
    if (options.requireMarker && !hasMarker) continue;

    // Trailing whitespace can be swallowed by the optional groups; anchor the span to real text.
    const start = (match.index ?? 0) + (full.length - full.trimStart().length);
    const end = (match.index ?? 0) + full.trimEnd().length;

    candidates.push({ amount, start, end, score: hasMarker ? 2 : 1 });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score || a.start - b.start);
    const best = candidates[0]!;
    return { amount: best.amount, start: best.start, end: best.end };
  }

  return options.requireMarker ? null : findWordAmount(text);
}

/** Rounds to paise — spoken input like "one third of 100" can otherwise produce long floats, and
 * the Transaction schema stores a plain Number. */
export function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    // An unknown/misconfigured currency code must not take the whole reply down.
    return `${currency} ${amount}`;
  }
}

/** Parses a plain integer count ("last 5 transactions", "pichle 3 din"). */
export function findCount(text: string, pattern: RegExp): number | null {
  const match = normalize(text).match(pattern);
  const raw = match?.[1];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}
