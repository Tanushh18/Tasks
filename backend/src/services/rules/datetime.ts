import { DateTime } from "luxon";

export type RecurrenceType = "daily" | "weekly" | "monthly";

export interface WhenMatch {
  /** YYYY-MM-DD, only when the message actually named a day. */
  date?: string;
  /** HH:mm, only when the message actually named a time. */
  time?: string;
  recurrence?: RecurrenceType;
  explicitDate: boolean;
  explicitTime: boolean;
  /** Character ranges consumed, so the caller can blank them out of a title. */
  spans: Array<[number, number]>;
}

export interface DateRange {
  from?: string;
  to?: string;
  /** Which range was recognised, so the reply can say "this month" in the right language. */
  label: "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "thisYear" | "lastNDays" | "allTime";
  days?: number;
}

/** Luxon weekdays: 1 = Monday … 7 = Sunday. */
const WEEKDAYS: Record<string, number> = {
  monday: 1, mon: 1, somvar: 1, somwar: 1, "सोमवार": 1,
  tuesday: 2, tue: 2, tues: 2, mangalvar: 2, mangalwar: 2, "मंगलवार": 2,
  wednesday: 3, wed: 3, weds: 3, budhvar: 3, budhwar: 3, "बुधवार": 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, guruvar: 4, guruwar: 4, brihaspativar: 4, "गुरुवार": 4,
  friday: 5, fri: 5, shukravar: 5, shukrawar: 5, "शुक्रवार": 5,
  saturday: 6, sat: 6, shanivar: 6, shaniwar: 6, "शनिवार": 6,
  sunday: 7, sun: 7, ravivar: 7, raviwar: 7, itwar: 7, itvar: 7, "रविवार": 7,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, janvari: 1, "जनवरी": 1,
  feb: 2, february: 2, farvari: 2, "फरवरी": 2,
  mar: 3, march: 3, "मार्च": 3,
  apr: 4, april: 4, aprail: 4, "अप्रैल": 4,
  may: 5, mai: 5, "मई": 5,
  jun: 6, june: 6, "जून": 6,
  jul: 7, july: 7, julai: 7, "जुलाई": 7,
  aug: 8, august: 8, agast: 8, "अगस्त": 8,
  sep: 9, sept: 9, september: 9, sitambar: 9, "सितंबर": 9,
  oct: 10, october: 10, aktubar: 10, "अक्टूबर": 10,
  nov: 11, november: 11, navambar: 11, "नवंबर": 11,
  dec: 12, december: 12, disambar: 12, "दिसंबर": 12,
};

const WEEKDAY_PATTERN = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");
const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

/** Rough part-of-day, used both to disambiguate a bare hour and as a time on its own. Kept
 * finer-grained than am/pm because "tomorrow night" and "tomorrow evening" mean different hours
 * even though both are PM. */
type Period = "am" | "afternoon" | "evening" | "night" | "noon" | "midnight";

const PERIOD_DEFAULT_HOUR: Record<Period, number> = {
  am: 9,
  noon: 12,
  afternoon: 14,
  evening: 18,
  night: 21,
  midnight: 0,
};

const PM_PERIODS = new Set<Period>(["afternoon", "evening", "night"]);

interface ParseState {
  date?: DateTime;
  hour?: number;
  minute?: number;
  meridiemKnown: boolean;
  period?: Period;
  periodDefaultOnly: boolean;
  recurrence?: RecurrenceType;
  weekday?: number;
  relativeMinutes?: number;
  spans: Array<[number, number]>;
}

function overlaps(start: number, end: number, spans: Array<[number, number]>): boolean {
  return spans.some(([s, e]) => start < e && end > s);
}

/**
 * Applies the first non-overlapping match of `re`. Returns true if something was consumed, so
 * ordering alone decides precedence — "day after tomorrow" is registered before "tomorrow", and
 * the earlier rule wins the characters.
 */
function scan(
  text: string,
  re: RegExp,
  state: ParseState,
  apply: (match: RegExpMatchArray) => boolean
): boolean {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const pattern = new RegExp(re.source, flags);

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, state.spans)) continue;
    if (!apply(match)) continue;
    state.spans.push([start, end]);
    return true;
  }
  return false;
}

function parseRecurrence(text: string, state: ParseState): void {
  // "every monday" also pins the weekday, so it has to beat the generic weekly rule.
  scan(text, new RegExp(String.raw`\b(?:every|each|har)\s+(${WEEKDAY_PATTERN})\b`, "i"), state, (m) => {
    state.recurrence = "weekly";
    state.weekday = WEEKDAYS[m[1]!.toLowerCase()];
    return true;
  });

  if (!state.recurrence) {
    scan(text, /\b(?:every\s*day|everyday|daily|har\s+roz|har\s+din|rozana|roz|प्रतिदिन|रोज़?|हर\s+दिन)\b/i, state, () => {
      state.recurrence = "daily";
      return true;
    });
  }
  if (!state.recurrence) {
    scan(text, /\b(?:every\s+week|weekly|har\s+haft[ae]|साप्ताहिक|हर\s+हफ़?्ते)\b/i, state, () => {
      state.recurrence = "weekly";
      return true;
    });
  }
  if (!state.recurrence) {
    scan(text, /\b(?:every\s+month|monthly|har\s+mahin[ae]|मासिक|हर\s+महीने)\b/i, state, () => {
      state.recurrence = "monthly";
      return true;
    });
  }
}

function parsePeriodWords(text: string, state: ParseState): void {
  const rules: Array<[RegExp, Period]> = [
    [/\b(?:midnight|aadhi\s+raat|आधी\s+रात)\b/i, "midnight"],
    [/\b(?:noon|dopahar\s+ko|दोपहर\s+को)\b/i, "noon"],
    [/\b(?:morning|subah|savere|सुबह|सवेरे)\b/i, "am"],
    [/\b(?:afternoon|dopahar|दोपहर)\b/i, "afternoon"],
    [/\b(?:evening|shaam|sham|शाम)\b/i, "evening"],
    [/\b(?:night|raat|रात|tonight)\b/i, "night"],
  ];

  for (const [re, period] of rules) {
    if (state.period) break;
    scan(text, re, state, () => {
      state.period = period;
      return true;
    });
  }
}

function parseExplicitDate(text: string, now: DateTime, state: ParseState): void {
  // ISO first — unambiguous, and its dashes would otherwise be eaten by the D/M rule.
  scan(text, /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, state, (m) => {
    const dt = DateTime.fromObject(
      { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) },
      { zone: now.zone }
    );
    if (!dt.isValid) return false;
    state.date = dt;
    return true;
  });

  // "25 dec", "25th december 2026"
  if (!state.date) {
    scan(
      text,
      new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_PATTERN})\b\.?(?:\s*,?\s*(\d{4}))?`, "i"),
      state,
      (m) => {
        const month = MONTHS[m[2]!.toLowerCase()];
        if (!month) return false;
        return setCalendarDate(state, now, Number(m[1]), month, m[3] ? Number(m[3]) : undefined);
      }
    );
  }

  // "dec 25", "december 25th, 2026"
  if (!state.date) {
    scan(
      text,
      new RegExp(String.raw`\b(${MONTH_PATTERN})\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?`, "i"),
      state,
      (m) => {
        const month = MONTHS[m[1]!.toLowerCase()];
        if (!month) return false;
        return setCalendarDate(state, now, Number(m[2]), month, m[3] ? Number(m[3]) : undefined);
      }
    );
  }

  // "25/12", "25-12-2026", "25.12.26" — day-first, the convention this app's users write in.
  if (!state.date) {
    scan(text, /\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/, state, (m) => {
      const day = Number(m[1]);
      const month = Number(m[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return false;
      let year: number | undefined;
      if (m[3]) {
        const raw = Number(m[3]);
        year = raw < 100 ? 2000 + raw : raw;
      }
      return setCalendarDate(state, now, day, month, year);
    });
  }
}

/** Sets a calendar date, rolling to next year when the year was omitted and the day already passed. */
function setCalendarDate(
  state: ParseState,
  now: DateTime,
  day: number,
  month: number,
  year?: number
): boolean {
  const resolvedYear = year ?? now.year;
  let dt = DateTime.fromObject({ year: resolvedYear, month, day }, { zone: now.zone });
  if (!dt.isValid) return false;
  if (year === undefined && dt.startOf("day") < now.startOf("day")) {
    dt = dt.plus({ years: 1 });
  }
  state.date = dt;
  return true;
}

function parseRelativeDay(text: string, now: DateTime, state: ParseState, pastBias: boolean): void {
  if (state.date) return;

  const rules: Array<[RegExp, () => DateTime | null]> = [
    [/\b(?:day\s+after\s+tomorrow|day\s+after\s+tmrw)\b/i, () => now.plus({ days: 2 })],
    [/\b(?:day\s+before\s+yesterday)\b/i, () => now.minus({ days: 2 })],
    // "parso" is symmetric in Hindi (two days either way); the surrounding intent decides.
    [/\b(?:parso|parson|परसों)\b/i, () => (pastBias ? now.minus({ days: 2 }) : now.plus({ days: 2 }))],
    [/\b(?:tomorrow|tomorow|tommorow|tommorrow|tmrw|tmw|tmrrw)\b/i, () => now.plus({ days: 1 })],
    [/\b(?:yesterday|yday)\b/i, () => now.minus({ days: 1 })],
    // Same ambiguity as "parso": "kal" is yesterday or tomorrow depending on tense.
    [/\b(?:kal|कल)\b/i, () => (pastBias ? now.minus({ days: 1 }) : now.plus({ days: 1 }))],
    [/\b(?:today|aaj|आज)\b/i, () => now],
    [/\b(?:tonight)\b/i, () => now],
    [/\b(?:next\s+week|agle\s+haft[ae]|अगले\s+हफ़?्ते)\b/i, () => now.plus({ weeks: 1 })],
    [/\b(?:last\s+week|pichle\s+haft[ae]|पिछले\s+हफ़?्ते)\b/i, () => now.minus({ weeks: 1 })],
    [/\b(?:next\s+month|agle\s+mahine|अगले\s+महीने)\b/i, () => now.plus({ months: 1 })],
    [/\b(?:end\s+of\s+(?:the\s+)?month|month\s+end)\b/i, () => now.endOf("month").startOf("day")],
  ];

  for (const [re, resolve] of rules) {
    if (state.date) break;
    scan(text, re, state, () => {
      const dt = resolve();
      if (!dt?.isValid) return false;
      state.date = dt;
      return true;
    });
  }
}

function parseWeekday(text: string, now: DateTime, state: ParseState): void {
  if (state.date || state.weekday !== undefined) return;

  // Qualified forms first: "next friday" must not be consumed by the bare-weekday rule.
  scan(
    text,
    new RegExp(String.raw`\b(next|this|coming|agle|is|aane\s+wale)\s+(${WEEKDAY_PATTERN})\b`, "i"),
    state,
    (m) => {
      const weekday = WEEKDAYS[m[2]!.toLowerCase()];
      if (!weekday) return false;
      const qualifier = m[1]!.toLowerCase();
      let dt = now.startOf("day").set({ weekday: weekday as 1 });
      if (dt < now.startOf("day")) dt = dt.plus({ weeks: 1 });
      // "next X" means the following week even when this week's X is still ahead.
      if ((qualifier === "next" || qualifier === "agle") && dt.hasSame(now, "week")) {
        dt = dt.plus({ weeks: 1 });
      }
      state.date = dt;
      return true;
    }
  );

  if (state.date) return;

  scan(text, new RegExp(String.raw`\b(${WEEKDAY_PATTERN})\b`, "i"), state, (m) => {
    const weekday = WEEKDAYS[m[1]!.toLowerCase()];
    if (!weekday) return false;
    let dt = now.startOf("day").set({ weekday: weekday as 1 });
    // A bare weekday means the next one — today counts only if it is today's weekday, in which
    // case the time-of-day check later decides whether it has already passed.
    if (dt < now.startOf("day")) dt = dt.plus({ weeks: 1 });
    state.date = dt;
    return true;
  });
}

function parseOffsets(text: string, now: DateTime, state: ParseState): void {
  const minuteRe = /\b(?:in|after|baad|within)?\s*(\d+)\s*(minutes?|mins?|minute|मिनट)\s*(?:baad|later|mein|में)?\b/i;
  const hourRe = /\b(?:in|after|baad|within)?\s*(\d+)\s*(hours?|hrs?|hour|ghante?|घंटे?)\s*(?:baad|later|mein|में)?\b/i;
  const dayRe = /\b(?:in|after|baad)?\s*(\d+)\s*(days?|din|दिन)\s*(?:baad|later|mein|में)?\b/i;
  const weekRe = /\b(?:in|after|baad)?\s*(\d+)\s*(weeks?|haft[ae]|हफ़?्ते)\s*(?:baad|later|mein|में)?\b/i;
  const monthRe = /\b(?:in|after|baad)?\s*(\d+)\s*(months?|mahin[ae]|महीने?)\s*(?:baad|later|mein|में)?\b/i;

  // A bare "5 minutes" with no in/after/baad is usually part of a title ("5 minute plank"), so
  // require one of those cue words for the offset reading.
  const hasCue = /\b(?:in|after|baad|later|within|mein|में)\b/i.test(text);
  if (!hasCue) return;

  if (state.relativeMinutes === undefined) {
    scan(text, minuteRe, state, (m) => {
      state.relativeMinutes = Number(m[1]);
      return Number.isFinite(state.relativeMinutes);
    });
  }
  if (state.relativeMinutes === undefined) {
    scan(text, hourRe, state, (m) => {
      state.relativeMinutes = Number(m[1]) * 60;
      return Number.isFinite(state.relativeMinutes);
    });
  }
  if (state.relativeMinutes === undefined && !state.date) {
    scan(text, dayRe, state, (m) => {
      state.date = now.plus({ days: Number(m[1]) });
      return true;
    });
  }
  if (state.relativeMinutes === undefined && !state.date) {
    scan(text, weekRe, state, (m) => {
      state.date = now.plus({ weeks: Number(m[1]) });
      return true;
    });
  }
  if (state.relativeMinutes === undefined && !state.date) {
    scan(text, monthRe, state, (m) => {
      state.date = now.plus({ months: Number(m[1]) });
      return true;
    });
  }
}

function setTime(state: ParseState, hour: number, minute: number, meridiemKnown: boolean): boolean {
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return false;
  state.hour = hour === 24 ? 0 : hour;
  state.minute = minute;
  state.meridiemKnown = meridiemKnown;
  return true;
}

function applyMeridiem(hour: number, meridiem: string): number {
  const isPm = /^p/i.test(meridiem);
  if (isPm) return hour === 12 ? 12 : hour + 12;
  return hour === 12 ? 0 : hour;
}

function parseTime(text: string, state: ParseState): void {
  if (state.hour !== undefined) return;

  // "5:30 pm", "17:30", "5:30"
  scan(text, /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b/i, state, (m) => {
    const rawHour = Number(m[1]);
    const minute = Number(m[2]);
    if (rawHour > 23) return false;
    if (m[3]) return setTime(state, applyMeridiem(rawHour, m[3]), minute, true);
    return setTime(state, rawHour, minute, rawHour > 12 || rawHour === 0);
  });

  // "5.30 pm" — the dot form only counts with an explicit meridiem, else it is a decimal amount.
  if (state.hour === undefined) {
    scan(text, /\b(\d{1,2})\.(\d{2})\s*(a\.?m\.?|p\.?m\.?)\b/i, state, (m) =>
      setTime(state, applyMeridiem(Number(m[1]), m[3]!), Number(m[2]), true)
    );
  }

  // "5pm", "11 am"
  if (state.hour === undefined) {
    scan(text, /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/i, state, (m) => {
      const rawHour = Number(m[1]);
      if (rawHour > 12) return false;
      return setTime(state, applyMeridiem(rawHour, m[2]!), 0, true);
    });
  }

  // Hindi fractional hours: "sawa 5" = 5:15, "saade 5" = 5:30, "paune 5" = 4:45.
  if (state.hour === undefined) {
    scan(text, /\b(sawa|साढ़े|saade|sade|paune|पौने|सवा)\s*(\d{1,2})\b/i, state, (m) => {
      const word = m[1]!.toLowerCase();
      const hour = Number(m[2]);
      if (word === "sawa" || word === "सवा") return setTime(state, hour, 15, false);
      if (word === "paune" || word === "पौने") return setTime(state, hour === 1 ? 12 : hour - 1, 45, false);
      return setTime(state, hour, 30, false);
    });
  }
  if (state.hour === undefined) {
    scan(text, /\b(dedh|डेढ़)\b/i, state, () => setTime(state, 1, 30, false));
  }
  if (state.hour === undefined) {
    scan(text, /\b(dhai|dhaai|ढाई)\b/i, state, () => setTime(state, 2, 30, false));
  }

  // "5 baje", "9 बजे"
  if (state.hour === undefined) {
    scan(text, /\b(\d{1,2})(?::(\d{2}))?\s*(?:baje|बजे)\b/i, state, (m) => {
      const rawHour = Number(m[1]);
      if (rawHour > 23) return false;
      return setTime(state, rawHour, m[2] ? Number(m[2]) : 0, rawHour > 12);
    });
  }

  // "1730 hrs"
  if (state.hour === undefined) {
    scan(text, /\b(\d{2})(\d{2})\s*(?:hrs?|hours)\b/i, state, (m) =>
      setTime(state, Number(m[1]), Number(m[2]), true)
    );
  }

  // "5 o'clock"
  if (state.hour === undefined) {
    scan(text, /\b(\d{1,2})\s*o'?\s*clock\b/i, state, (m) => {
      const rawHour = Number(m[1]);
      if (rawHour > 23) return false;
      return setTime(state, rawHour, 0, rawHour > 12);
    });
  }

  // Bare hour, but only after an explicit "at" so a stray number is never read as a time.
  if (state.hour === undefined) {
    scan(text, /\bat\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:st|nd|rd|th)\b)/i, state, (m) => {
      const rawHour = Number(m[1]);
      if (rawHour > 23) return false;
      return setTime(state, rawHour, m[2] ? Number(m[2]) : 0, rawHour > 12 || rawHour === 0);
    });
  }
}

/**
 * Turns the collected pieces into concrete date/time strings.
 *
 * Two judgement calls live here:
 * - A bare hour (no am/pm, no period word) is read as PM for 1-7 and AM for 8-11 — how people
 *   normally mean "remind me at 6".
 * - If the user named a time but no date and that time has already passed today, it rolls to
 *   tomorrow. An explicitly named date is never overridden, even if it is in the past.
 */
function resolve(state: ParseState, now: DateTime, pastBias: boolean): WhenMatch {
  const explicitDate = state.date !== undefined || state.weekday !== undefined;
  const explicitTime =
    state.hour !== undefined || state.relativeMinutes !== undefined || state.period !== undefined;

  if (state.relativeMinutes !== undefined) {
    const target = now.plus({ minutes: state.relativeMinutes });
    return {
      date: target.toISODate() ?? undefined,
      time: target.toFormat("HH:mm"),
      recurrence: state.recurrence,
      explicitDate: true,
      explicitTime: true,
      spans: state.spans,
    };
  }

  let hour = state.hour;
  let minute = state.minute ?? 0;

  if (hour === undefined && state.period) {
    hour = PERIOD_DEFAULT_HOUR[state.period];
    minute = 0;
  } else if (hour !== undefined && !state.meridiemKnown) {
    if (state.period !== undefined && PM_PERIODS.has(state.period) && hour < 12) hour += 12;
    else if (state.period === "am" && hour === 12) hour = 0;
    else if (state.period === "midnight") hour = 0;
    else if (state.period === undefined && hour >= 1 && hour <= 7) hour += 12;
  }

  let date = state.date;
  if (date === undefined && state.weekday !== undefined) {
    date = now.startOf("day").set({ weekday: state.weekday as 1 });
    if (date < now.startOf("day")) date = date.plus({ weeks: 1 });
  }

  // Time named without a day: today if it is still ahead, otherwise tomorrow. Skipped when the
  // intent is backward-looking (logging an expense that already happened).
  if (date === undefined && hour !== undefined && !pastBias) {
    const candidate = now.set({ hour, minute, second: 0, millisecond: 0 });
    date = candidate <= now ? now.plus({ days: 1 }) : now;
  }

  // A named day whose time has passed (e.g. bare "monday" said on Monday evening) rolls forward.
  if (state.weekday !== undefined && hour !== undefined && date !== undefined && !pastBias) {
    const candidate = date.set({ hour, minute, second: 0, millisecond: 0 });
    if (candidate <= now) date = date.plus({ weeks: 1 });
  }

  return {
    date: date?.toISODate() ?? undefined,
    time: hour !== undefined ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : undefined,
    recurrence: state.recurrence,
    explicitDate,
    explicitTime,
    spans: state.spans,
  };
}

/**
 * Extracts date, time and recurrence from a message.
 *
 * `pastBias` flips the ambiguous Hindi words ("kal", "parso" mean both directions) toward the past
 * and stops times rolling into the future — right for logging a transaction that already happened,
 * wrong for scheduling a reminder.
 */
export function parseWhen(
  text: string,
  now: DateTime,
  options: { pastBias?: boolean } = {}
): WhenMatch {
  const pastBias = options.pastBias ?? false;
  const state: ParseState = { meridiemKnown: false, periodDefaultOnly: false, spans: [] };

  parseRecurrence(text, state);
  parsePeriodWords(text, state);
  parseExplicitDate(text, now, state);
  parseRelativeDay(text, now, state, pastBias);
  parseWeekday(text, now, state);
  parseOffsets(text, now, state);
  parseTime(text, state);

  return resolve(state, now, pastBias);
}

/** Default scheduling slot when a task names no time at all: 09:00, or the next hour if 09:00
 * has already gone by today. */
export function defaultSlot(now: DateTime, date?: string): { date: string; time: string } {
  const day = date ? DateTime.fromISO(date, { zone: now.zone }) : now;
  const isToday = day.hasSame(now, "day");
  const nineAm = day.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });

  if (!isToday || nineAm > now) {
    return { date: day.toISODate() ?? now.toISODate()!, time: "09:00" };
  }

  const next = now.plus({ hours: 1 }).startOf("hour");
  return { date: next.toISODate() ?? now.toISODate()!, time: next.toFormat("HH:mm") };
}

/** Date range for finance questions ("how much did I spend last month"). Defaults to the current
 * month, which is what people mean by a bare "how much have I spent". */
export function parseRange(text: string, now: DateTime): DateRange {
  const iso = (dt: DateTime) => dt.toISODate() ?? undefined;

  if (/\b(?:today|aaj|आज)\b/i.test(text)) {
    return { from: iso(now), to: iso(now), label: "today" };
  }
  if (/\b(?:yesterday|kal|कल)\b/i.test(text)) {
    const y = now.minus({ days: 1 });
    return { from: iso(y), to: iso(y), label: "yesterday" };
  }
  if (/\b(?:last\s+week|pichle\s+haft[ae]|पिछले\s+हफ़?्ते)\b/i.test(text)) {
    const start = now.minus({ weeks: 1 }).startOf("week");
    return { from: iso(start), to: iso(start.endOf("week")), label: "lastWeek" };
  }
  if (/\b(?:this\s+week|is\s+haft[ae]|इस\s+हफ़?्ते)\b/i.test(text)) {
    return { from: iso(now.startOf("week")), to: iso(now.endOf("week")), label: "thisWeek" };
  }
  if (/\b(?:last\s+month|pichle\s+mahine|previous\s+month|पिछले\s+महीने)\b/i.test(text)) {
    const start = now.minus({ months: 1 }).startOf("month");
    return { from: iso(start), to: iso(start.endOf("month")), label: "lastMonth" };
  }
  if (/\b(?:this\s+year|is\s+saal|इस\s+साल)\b/i.test(text)) {
    return { from: iso(now.startOf("year")), to: iso(now.endOf("year")), label: "thisYear" };
  }

  const lastNDays = text.match(/\b(?:last|past|pichle|previous)\s+(\d+)\s*(?:days?|din|दिन)\b/i);
  if (lastNDays?.[1]) {
    const days = Number(lastNDays[1]);
    if (Number.isFinite(days) && days > 0) {
      return { from: iso(now.minus({ days: days - 1 })), to: iso(now), label: "lastNDays", days };
    }
  }

  if (/\b(?:all\s+time|overall|total|kul|अब\s+तक|ever)\b/i.test(text)) {
    return { label: "allTime" };
  }

  return { from: iso(now.startOf("month")), to: iso(now.endOf("month")), label: "thisMonth" };
}

/** Human-friendly day label for replies: "today"/"tomorrow" when close, else "19 Aug". */
export function describeDate(date: string, now: DateTime): "today" | "tomorrow" | "yesterday" | string {
  const dt = DateTime.fromISO(date, { zone: now.zone });
  if (!dt.isValid) return date;
  const diff = Math.round(dt.startOf("day").diff(now.startOf("day"), "days").days);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return dt.toFormat(dt.hasSame(now, "year") ? "d LLL" : "d LLL yyyy");
}

/** 24h "17:30" → "5:30 PM", which reads better in a reply and speaks better through TTS. */
export function describeTime(time: string): string {
  const [rawHour, rawMinute] = time.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${display} ${suffix}` : `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}
