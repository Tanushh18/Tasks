import type { Locale } from "./types";

/** Devanagari digits ०-९ map onto 0-9 — normalizing them up front means every downstream
 * number/date/time regex only has to handle ASCII digits. */
const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function normalizeDigits(input: string): string {
  return input.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/**
 * Devanagari keywords, rewritten to their Hinglish spellings before matching.
 *
 * This exists because JavaScript's `\b` is defined over `[A-Za-z0-9_]` only: in `/\bकल\b/` the
 * boundary can never match, since a space and क are both "non-word" characters. Rather than
 * hand-build Unicode boundaries into several dozen patterns, the handful of command keywords are
 * folded to Latin here and every matcher stays single-script.
 *
 * Only keywords are folded — the rest of the message (notably task titles) keeps its original
 * script, and the reply language is chosen from the untouched raw text by `detectLocale`.
 * Patterns downstream still list their Devanagari spellings as a safety net for anything missed
 * here.
 */
const DEVANAGARI_KEYWORDS: Array<[RegExp, string]> = [
  // Multi-word phrases first — "पूरा हो गया" must not be split by the single-word rules.
  [/याद\s+दिलाना|याद\s+दिला\s+दो/g, "yaad dilana"],
  [/पूरा\s+हो\s+गया/g, "poora ho gaya"],
  [/पूरा\s+कर\s+दो/g, "poora kar do"],
  [/हटा\s+दो/g, "hata do"],
  [/आधी\s+रात/g, "aadhi raat"],
  [/हर\s+दिन/g, "har din"],
  [/हर\s+हफ़?्ते/g, "har hafte"],
  [/हर\s+महीने/g, "har mahine"],
  [/अगले\s+हफ़?्ते/g, "agle hafte"],
  [/पिछले\s+हफ़?्ते/g, "pichle hafte"],
  [/अगले\s+महीने/g, "agle mahine"],
  [/पिछले\s+महीने/g, "pichle mahine"],
  [/इस\s+हफ़?्ते/g, "is hafte"],
  [/इस\s+महीने/g, "is mahine"],
  [/इस\s+साल/g, "is saal"],
  [/सबसे\s+ज़्यादा/g, "sabse zyada"],
  [/क्या\s+कर\s+सकते/g, "kya kar sakte"],
  // Days and time
  [/परसों/g, "parso"],
  [/कल/g, "kal"],
  [/आज/g, "aaj"],
  [/सुबह|सवेरे/g, "subah"],
  [/दोपहर/g, "dopahar"],
  [/शाम/g, "shaam"],
  [/रात/g, "raat"],
  [/बजे/g, "baje"],
  [/साढ़े/g, "saade"],
  [/सवा/g, "sawa"],
  [/पौने/g, "paune"],
  [/डेढ़/g, "dedh"],
  [/ढाई/g, "dhai"],
  [/रोज़?ाना|रोज़?/g, "roz"],
  [/प्रतिदिन/g, "roz"],
  [/साप्ताहिक/g, "weekly"],
  [/मासिक/g, "monthly"],
  [/दिन/g, "din"],
  // Weekdays
  [/सोमवार/g, "somvar"], [/मंगलवार/g, "mangalvar"], [/बुधवार/g, "budhvar"],
  [/गुरुवार/g, "guruvar"], [/शुक्रवार/g, "shukravar"], [/शनिवार/g, "shanivar"], [/रविवार/g, "ravivar"],
  // Months
  [/जनवरी/g, "jan"], [/फरवरी/g, "feb"], [/मार्च/g, "mar"], [/अप्रैल/g, "apr"],
  [/मई/g, "may"], [/जून/g, "jun"], [/जुलाई/g, "jul"], [/अगस्त/g, "aug"],
  [/सितंबर/g, "sep"], [/अक्टूबर/g, "oct"], [/नवंबर/g, "nov"], [/दिसंबर/g, "dec"],
  // Domain nouns and verbs
  [/रिमाइंडर/g, "reminder"],
  [/कार्य/g, "task"],
  [/काम/g, "kaam"],
  [/खर्च/g, "kharch"],
  [/लेनदेन/g, "lenden"],
  [/खाते|खाता/g, "khata"],
  [/रुपये|रुपया/g, "rupaye"],
  [/पैसे|पैसा/g, "paise"],
  [/जमा/g, "jama"],
  [/मिले|मिला/g, "mila"],
  [/दिए/g, "diye"],
  [/हटाओ/g, "hatao"],
  [/दिखाओ/g, "dikhao"],
  [/बताओ/g, "batao"],
  [/बनाओ/g, "banao"],
  [/जोड़ो/g, "jodo"],
  [/कितने|कितना|कितनी/g, "kitna"],
  [/कहाँ/g, "kahan"],
  [/क्या/g, "kya"],
  [/सभी|सब/g, "sab"],
  [/बाकी/g, "baaki"],
  [/पूरे/g, "poore"],
  [/ज़रूरी|जरूरी/g, "zaroori"],
  [/मदद/g, "madad"],
  [/नमस्ते|नमस्कार/g, "namaste"],
  [/धन्यवाद/g, "dhanyavaad"],
  [/शुक्रिया/g, "shukriya"],
  [/श्रेणी/g, "category"],
  [/बचा/g, "bacha"],
  [/हुआ/g, "hua"],
  [/अब\s+तक/g, "ab tak"],
];

function foldDevanagariKeywords(input: string): string {
  let text = input;
  for (const [pattern, replacement] of DEVANAGARI_KEYWORDS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

/** Lowercases, normalizes digits and smart punctuation, folds Devanagari keywords, and collapses
 * whitespace. Everything the matchers see goes through here, so patterns never have to account
 * for "don’t" vs "don't" or for two scripts. */
export function normalize(input: string): string {
  return foldDevanagariKeywords(normalizeDigits(input).toLowerCase())
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const DEVANAGARI = /[ऀ-ॿ]/;

/** Latin-script words that reliably signal Hinglish rather than English. Kept to words that are
 * unambiguous in this app's domain — "do" is skipped on purpose (English "do" is far too common). */
const HINGLISH_MARKERS = [
  "karo", "kardo", "kar", "kro", "dena", "dedo", "diya", "kiya", "kiye", "hai", "hain", "tha", "thi",
  "kya", "kyu", "kaise", "kitna", "kitne", "kitni", "mera", "meri", "mere", "mujhe", "muje", "yaad",
  "dilana", "dila", "aaj", "kal", "parso", "subah", "shaam", "sham", "raat", "dopahar", "baje",
  "kharch", "kharcha", "paisa", "paise", "rupaye", "rupay", "hata", "hatao", "dikha", "dikhao",
  "bata", "batao", "banao", "bana", "gaya", "gayi", "hua", "hui", "wala", "wali", "liye", "sab",
  "naya", "nayi", "purana", "roz", "har", "hafte", "mahine", "saal", "din", "abhi", "phir", "bhi",
  "nahi", "nahin", "haan", "theek", "thik", "acha", "accha", "chahiye", "lagao", "laga", "poora",
  "pura", "khatam", "shuru", "aur", "ya", "se", "ko", "ka", "ki", "ke", "me", "mein", "pe", "par",
];

const HINGLISH_MARKER_SET = new Set(HINGLISH_MARKERS);

/** Single-letter/2-letter Hindi particles ("se", "ko", "ka") also occur in English text as noise,
 * so they only count toward Hinglish when a stronger marker is present too. */
const WEAK_MARKERS = new Set(["se", "ko", "ka", "ki", "ke", "me", "mein", "pe", "par", "aur", "ya", "bhi", "sab", "har"]);

export function detectLocale(raw: string): Locale {
  if (DEVANAGARI.test(raw)) return "hi";

  const tokens = normalize(raw).split(/[^a-z0-9']+/).filter(Boolean);
  let strong = 0;
  let weak = 0;
  for (const token of tokens) {
    if (!HINGLISH_MARKER_SET.has(token)) continue;
    if (WEAK_MARKERS.has(token)) weak += 1;
    else strong += 1;
  }

  if (strong >= 1) return "hinglish";
  if (weak >= 2) return "hinglish";
  return "en";
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words that carry no meaning when comparing a spoken reference ("the milk one") against a
 * stored task title ("Buy milk") — dropped from both sides before scoring. */
const STOP_WORDS = new Set([
  "a", "an", "the", "my", "me", "to", "for", "of", "on", "at", "in", "is", "it", "that", "this",
  "please", "pls", "plz", "task", "reminder", "one", "wala", "wali", "ka", "ki", "ke", "ko", "se",
  "mera", "meri", "mere", "vala", "vali",
]);

export function contentTokens(input: string): string[] {
  return normalize(input)
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/** Fraction of `reference`'s meaningful tokens that also appear in `candidate` (0-1). Asymmetric
 * on purpose: "milk" should score 1.0 against the task "Buy milk from the store", because the user
 * naming a fragment of a longer title is the normal case. */
export function tokenCoverage(reference: string, candidate: string): number {
  const refTokens = contentTokens(reference);
  if (refTokens.length === 0) return 0;
  const candTokens = new Set(contentTokens(candidate));
  let hits = 0;
  for (const token of refTokens) {
    if (candTokens.has(token)) hits += 1;
  }
  return hits / refTokens.length;
}

/** Leading words that survive intent-trigger removal but aren't part of what the user named. */
const LEADING_FILLERS = [
  "to", "that", "the", "a", "an", "my", "me", "for", "about", "of", "is", "was",
  "ki", "ke", "ka", "ko", "kaa", "please", "pls", "plz", "kripya",
];

/**
 * Trailing politeness/imperative tails, mostly Hinglish ("... kar do", "... bana dena"), plus the
 * prepositions that get stranded when a date/time phrase is blanked out of the middle of a
 * sentence — "remind me to call mom tomorrow at 5pm" leaves "call mom at".
 */
const TRAILING_FILLERS = [
  "please", "pls", "plz", "thanks", "thank you", "kripya", "kar do", "kardo", "kar dena", "karna",
  "karo", "kro", "kar", "de do", "dedo", "dena", "de", "do it", "for me", "mere liye", "abhi",
  "ok", "okay", "theek hai", "thik hai",
  "at", "on", "by", "for", "to", "from", "till", "until", "@", "ko", "pe", "par", "mein", "me",
];

/** Trims filler words, wrapping quotes and stray punctuation off an extracted title/reference. */
export function cleanPhrase(input: string): string {
  let text = input.replace(/\s+/g, " ").trim();

  // Strip matched wrapping quotes first — the user may have quoted a title that itself starts
  // with a filler word ("remind me to \"the standup\"") and that word must survive.
  const quoted = text.match(/^["'](.+)["']$/);
  if (quoted?.[1]) return quoted[1].trim();

  let changed = true;
  while (changed) {
    changed = false;
    text = text.replace(/^[\s,;:.!?-]+|[\s,;:.!?-]+$/g, "").trim();

    for (const filler of LEADING_FILLERS) {
      const re = new RegExp(`^${escapeRegex(filler)}\\b\\s*`, "i");
      if (re.test(text)) {
        text = text.replace(re, "").trim();
        changed = true;
      }
    }
    for (const filler of TRAILING_FILLERS) {
      const re = new RegExp(`\\s*\\b${escapeRegex(filler)}$`, "i");
      if (re.test(text)) {
        text = text.replace(re, "").trim();
        changed = true;
      }
    }
  }

  return text.replace(/\s+/g, " ").trim();
}

export function capitalizeFirst(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

/** Cuts a string to `max` characters on a word boundary where possible. Titles and categories have
 * hard schema limits (200 / 60), and a spoken run-on sentence can exceed them. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Blanks out consumed character ranges (a matched date/time phrase) so the remaining text can be
 * used as the title. Replaces with spaces rather than deleting to keep later indices valid. */
export function blankSpans(input: string, spans: Array<[number, number]>): string {
  if (spans.length === 0) return input;
  const chars = input.split("");
  for (const [start, end] of spans) {
    for (let i = Math.max(0, start); i < Math.min(chars.length, end); i += 1) {
      chars[i] = " ";
    }
  }
  return chars.join("").replace(/\s+/g, " ").trim();
}
