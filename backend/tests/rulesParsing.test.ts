import { DateTime } from "luxon";
import { defaultSlot, describeDate, describeTime, parseRange, parseWhen } from "../src/services/rules/datetime";
import { findAmount, formatCurrency } from "../src/services/rules/numbers";
import { cleanPhrase, detectLocale, normalize, tokenCoverage } from "../src/services/rules/text";

const ZONE = "Asia/Kolkata";
/** Wednesday, 19 Aug 2026 at 10:00 — fixed so relative parsing is deterministic. */
const NOW = DateTime.fromISO("2026-08-19T10:00", { zone: ZONE });

function when(text: string, options?: { pastBias?: boolean }) {
  return parseWhen(normalize(text), NOW, options);
}

describe("rule engine — date parsing", () => {
  it("resolves relative days", () => {
    expect(when("tomorrow").date).toBe("2026-08-20");
    expect(when("today").date).toBe("2026-08-19");
    expect(when("day after tomorrow").date).toBe("2026-08-21");
    expect(when("yesterday", { pastBias: true }).date).toBe("2026-08-18");
    expect(when("next week").date).toBe("2026-08-26");
  });

  it("prefers the longer phrase when two rules could match", () => {
    // "day after tomorrow" must not be consumed by the plain "tomorrow" rule.
    expect(when("day after tomorrow at 5pm").date).toBe("2026-08-21");
  });

  it("reads ambiguous Hindi day words in the direction the intent implies", () => {
    // "kal" and "parso" mean both directions in Hindi; tense decides which.
    expect(when("kal").date).toBe("2026-08-20");
    expect(when("kal", { pastBias: true }).date).toBe("2026-08-18");
    expect(when("parso").date).toBe("2026-08-21");
    expect(when("parso", { pastBias: true }).date).toBe("2026-08-17");
  });

  it("resolves weekdays, qualified and bare", () => {
    // 19 Aug 2026 is a Wednesday.
    expect(when("friday").date).toBe("2026-08-21");
    expect(when("next monday").date).toBe("2026-08-24");
    expect(when("sunday").date).toBe("2026-08-23");
    expect(when("shukravar").date).toBe("2026-08-21");
  });

  it("parses explicit calendar dates in several formats", () => {
    expect(when("25 dec").date).toBe("2026-12-25");
    expect(when("dec 25").date).toBe("2026-12-25");
    expect(when("25th december 2026").date).toBe("2026-12-25");
    expect(when("25/12/2026").date).toBe("2026-12-25");
    expect(when("2026-12-25").date).toBe("2026-12-25");
    expect(when("25/12").date).toBe("2026-12-25");
  });

  it("rolls a bare day/month that already passed into next year", () => {
    expect(when("1 jan").date).toBe("2027-01-01");
  });

  it("handles relative offsets", () => {
    expect(when("in 30 minutes").time).toBe("10:30");
    expect(when("in 2 hours").time).toBe("12:00");
    expect(when("in 3 days").date).toBe("2026-08-22");
    expect(when("in 2 weeks").date).toBe("2026-09-02");
  });

  it("ignores durations that are part of a title rather than a schedule", () => {
    // No "in"/"after" cue, so "5 minute" here is describing the task, not when it happens.
    expect(when("5 minute plank").explicitTime).toBe(false);
  });
});

describe("rule engine — time parsing", () => {
  it("parses common written time formats", () => {
    expect(when("at 5:30 pm").time).toBe("17:30");
    expect(when("at 17:30").time).toBe("17:30");
    expect(when("5pm").time).toBe("17:00");
    expect(when("11 am").time).toBe("11:00");
    expect(when("1730 hrs").time).toBe("17:30");
    expect(when("5 o'clock").time).toBe("17:00");
  });

  it("parses Hindi clock forms", () => {
    expect(when("shaam 5 baje").time).toBe("17:00");
    expect(when("subah 8 baje").time).toBe("08:00");
    expect(when("raat 9 baje").time).toBe("21:00");
    expect(when("dopahar 2 baje").time).toBe("14:00");
    expect(when("saade 5").time).toBe("17:30");
    expect(when("sawa 6").time).toBe("18:15");
    expect(when("paune 6").time).toBe("17:45");
  });

  it("reads a bare hour the way people mean it", () => {
    // 1-7 without am/pm is almost always afternoon/evening.
    expect(when("at 6").time).toBe("18:00");
    expect(when("at 11").time).toBe("11:00");
  });

  it("rolls a time that already passed today into tomorrow", () => {
    // 09:00 is behind the 10:00 "now", and no date was named.
    const result = when("at 9 am");
    expect(result.time).toBe("09:00");
    expect(result.date).toBe("2026-08-20");
  });

  it("keeps a past time when the user named the day explicitly", () => {
    const result = when("today at 9 am");
    expect(result.date).toBe("2026-08-19");
    expect(result.time).toBe("09:00");
  });

  it("resolves named parts of the day", () => {
    expect(when("tomorrow morning").time).toBe("09:00");
    expect(when("tomorrow evening").time).toBe("18:00");
    expect(when("tomorrow night").time).toBe("21:00");
    expect(when("tomorrow at noon").time).toBe("12:00");
    expect(when("tomorrow midnight").time).toBe("00:00");
  });
});

describe("rule engine — recurrence", () => {
  it("detects repeat intervals in both languages", () => {
    expect(when("every day at 7am").recurrence).toBe("daily");
    expect(when("daily").recurrence).toBe("daily");
    expect(when("har roz").recurrence).toBe("daily");
    expect(when("every week").recurrence).toBe("weekly");
    expect(when("every monday").recurrence).toBe("weekly");
    expect(when("monthly").recurrence).toBe("monthly");
    expect(when("har mahine").recurrence).toBe("monthly");
  });

  it("keeps the time alongside the recurrence", () => {
    const result = when("every day at 7am");
    expect(result.recurrence).toBe("daily");
    expect(result.time).toBe("07:00");
  });
});

describe("rule engine — amounts", () => {
  const amount = (text: string) => findAmount(normalize(text))?.amount;

  it("parses plain and currency-marked numbers", () => {
    expect(amount("500")).toBe(500);
    expect(amount("₹500")).toBe(500);
    expect(amount("rs 500")).toBe(500);
    expect(amount("rs.500")).toBe(500);
    expect(amount("500/-")).toBe(500);
    expect(amount("500.50")).toBe(500.5);
  });

  it("parses Indian digit grouping", () => {
    expect(amount("50,000")).toBe(50000);
    expect(amount("1,50,000")).toBe(150000);
  });

  it("applies scale words", () => {
    expect(amount("5k")).toBe(5000);
    expect(amount("2 lakh")).toBe(200000);
    expect(amount("1.5 lakh")).toBe(150000);
    expect(amount("1 crore")).toBe(10000000);
    expect(amount("2 hazaar")).toBe(2000);
  });

  it("parses spelled-out numbers in English and Hinglish", () => {
    expect(amount("five hundred")).toBe(500);
    expect(amount("paanch sau")).toBe(500);
    expect(amount("do hazaar")).toBe(2000);
    expect(amount("twenty five")).toBe(25);
  });

  it("prefers a marked amount over an unmarked number", () => {
    // "2" is a count here; the money is the marked ₹500.
    expect(amount("2 coffees for ₹500")).toBe(500);
  });

  it("returns nothing when a marker is required but absent", () => {
    expect(findAmount(normalize("buy 2 apples"), { requireMarker: true })).toBeNull();
  });

  it("formats currency for display", () => {
    expect(formatCurrency(500, "INR")).toContain("500");
    // An unknown currency code must degrade rather than throw.
    expect(formatCurrency(500, "ZZZ")).toContain("500");
  });
});

describe("rule engine — language detection", () => {
  it("identifies script and language", () => {
    expect(detectLocale("remind me to call mom tomorrow")).toBe("en");
    expect(detectLocale("मुझे कल याद दिलाना")).toBe("hi");
    expect(detectLocale("mujhe kal yaad dilana")).toBe("hinglish");
    expect(detectLocale("500 grocery pe kharch kiye")).toBe("hinglish");
  });

  it("does not mistake ordinary English for Hinglish", () => {
    expect(detectLocale("show me all the tasks for this week")).toBe("en");
  });
});

describe("rule engine — text helpers", () => {
  it("normalizes Devanagari digits", () => {
    expect(normalize("५०० रुपये")).toContain("500");
  });

  it("strips filler words and quotes from a phrase", () => {
    expect(cleanPhrase("to call mom please")).toBe("call mom");
    expect(cleanPhrase('"the standup"')).toBe("the standup");
    expect(cleanPhrase("doodh lana kar do")).toBe("doodh lana");
  });

  it("scores partial references against full titles", () => {
    expect(tokenCoverage("milk", "Buy milk from the store")).toBe(1);
    expect(tokenCoverage("buy milk", "Buy milk")).toBe(1);
    expect(tokenCoverage("gym", "Buy milk")).toBe(0);
  });
});

describe("rule engine — finance ranges and formatting", () => {
  it("resolves named ranges", () => {
    expect(parseRange("today", NOW).label).toBe("today");
    expect(parseRange("this month", NOW).label).toBe("thisMonth");
    expect(parseRange("last month", NOW).from).toBe("2026-07-01");
    expect(parseRange("pichle 7 din", NOW).label).toBe("lastNDays");
    expect(parseRange("overall", NOW).label).toBe("allTime");
  });

  it("defaults to the current month", () => {
    const range = parseRange("how much did i spend", NOW);
    expect(range.label).toBe("thisMonth");
    expect(range.from).toBe("2026-08-01");
  });

  it("describes dates and times for replies", () => {
    expect(describeDate("2026-08-19", NOW)).toBe("today");
    expect(describeDate("2026-08-20", NOW)).toBe("tomorrow");
    expect(describeDate("2026-12-25", NOW)).toBe("25 Dec");
    expect(describeTime("17:30")).toBe("5:30 PM");
    expect(describeTime("09:00")).toBe("9 AM");
    expect(describeTime("00:00")).toBe("12 AM");
  });

  it("falls back to a sensible slot when no time is given", () => {
    // 09:00 has already passed at 10:00, so today rolls to the next hour instead.
    expect(defaultSlot(NOW).time).toBe("11:00");
    expect(defaultSlot(NOW, "2026-08-20").time).toBe("09:00");
  });
});
