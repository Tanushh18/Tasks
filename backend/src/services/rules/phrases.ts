import type { DateRange } from "./datetime";
import type { Locale } from "./types";

export interface TaskLine {
  title: string;
  when: string;
  completed: boolean;
}

export interface Phrases {
  greeting(): string;
  thanks(): string;
  help(): string;
  outOfScope(): string;
  aiBusy(): string;
  aiUnavailable(): string;

  needTitle(): string;
  taskCreated(p: { title: string; when: string; reminder: boolean; recurrence?: string }): string;
  taskCompleted(title: string): string;
  taskReopened(title: string): string;
  taskDeleted(title: string): string;
  taskRescheduled(p: { title: string; when: string }): string;
  taskRenamed(p: { from: string; to: string }): string;
  taskNotFound(reference: string): string;
  taskAmbiguous(titles: string[]): string;
  tasksEmpty(scope: string): string;
  tasksList(p: { lines: TaskLine[]; total: number; scope: string }): string;

  accountsEmpty(): string;
  accountNeededForTransaction(): string;
  whichAccount(names: string[]): string;
  accountCreated(name: string): string;
  accountsList(names: string[]): string;

  transactionSaved(p: { inflow: boolean; amount: string; category?: string; account: string }): string;
  transactionConfirm(p: { inflow: boolean; amount: string; category?: string; account: string }): string;
  transactionDeclined(): string;
  summary(p: { inflow: string; outflow: string; net: string; range: string }): string;
  spending(p: { range: string; lines: string[]; biggest?: string }): string;
  noSpending(range: string): string;
  transactionsList(p: { range: string; lines: string[]; total: number }): string;

  /** Short confirmations for text-to-speech — never the full on-screen reply. */
  spokenDone(): string;
  spokenSaved(): string;
  spokenDeleted(): string;
  spokenCompleted(): string;
  spokenReopened(): string;

  rangeLabel(range: DateRange): string;
  scopePending(): string;
  scopeToday(): string;
  scopeOverdue(): string;
  scopeCompleted(): string;
  scopeAll(): string;
}

function joinLines(lines: string[]): string {
  return lines.join("\n");
}

const EN: Phrases = {
  greeting: () => "Hi! I can add tasks and reminders, mark them done, and track your spending. What would you like to do?",
  thanks: () => "You're welcome!",
  help: () =>
    joinLines([
      "Here's what I can do:",
      "• Add tasks — \"remind me to call mom tomorrow at 5pm\"",
      "• Complete or delete — \"mark buy milk as done\", \"delete gym\"",
      "• Reschedule — \"move standup to Friday 9am\"",
      "• See tasks — \"what's pending today?\"",
      "• Log money — \"spent 500 on groceries\"",
      "• Check spending — \"how much did I spend this month?\"",
    ]),
  outOfScope: () => "I can only help with your tasks, reminders and finances in this app.",
  aiBusy: () =>
    "I couldn't reach the AI service just now, so I can only handle direct commands. Try something like \"add task buy milk tomorrow at 6pm\" or \"how much did I spend this month?\".",
  aiUnavailable: () =>
    "I didn't catch that. Try a direct command like \"remind me to call mom tomorrow at 5pm\" or \"spent 500 on groceries\".",

  needTitle: () => "What should I call this task?",
  taskCreated: ({ title, when, reminder, recurrence }) =>
    `Added "${title}" for ${when}${recurrence ? `, repeating ${recurrence}` : ""}${reminder ? " with a reminder" : ""}.`,
  taskCompleted: (title) => `Marked "${title}" as done.`,
  taskReopened: (title) => `Marked "${title}" as not done.`,
  taskDeleted: (title) => `Deleted "${title}".`,
  taskRescheduled: ({ title, when }) => `Moved "${title}" to ${when}.`,
  taskRenamed: ({ from, to }) => `Renamed "${from}" to "${to}".`,
  taskNotFound: (reference) => `I couldn't find a task matching "${reference}".`,
  taskAmbiguous: (titles) =>
    joinLines([`I found more than one match — which one?`, ...titles.map((t) => `• ${t}`)]),
  tasksEmpty: (scope) => `You have no ${scope} tasks.`,
  tasksList: ({ lines, total, scope }) =>
    joinLines([
      `You have ${total} ${scope} task${total === 1 ? "" : "s"}:`,
      ...lines.map((l) => `• ${l.title} — ${l.when}${l.completed ? " (done)" : ""}`),
      ...(total > lines.length ? [`…and ${total - lines.length} more.`] : []),
    ]),

  accountsEmpty: () => "You don't have any finance accounts yet.",
  accountNeededForTransaction: () =>
    "You'll need a finance account first — tell me a name, like \"create account Home\".",
  whichAccount: (names) =>
    joinLines(["Which account should I use?", ...names.map((n) => `• ${n}`)]),
  accountCreated: (name) => `Created the account "${name}".`,
  accountsList: (names) => joinLines(["Your accounts:", ...names.map((n) => `• ${n}`)]),

  transactionSaved: ({ inflow, amount, category, account }) =>
    `Saved ${amount} ${inflow ? "in" : "out"}${category ? ` for ${category}` : ""} in ${account}.`,
  transactionConfirm: ({ inflow, amount, category, account }) =>
    `Save ${amount} ${inflow ? "received" : "spent"}${category ? ` on ${category}` : ""} in ${account}?`,
  transactionDeclined: () => "No problem, I won't save that.",
  summary: ({ inflow, outflow, net, range }) =>
    `${range}: ${inflow} in, ${outflow} out — net ${net}.`,
  spending: ({ range, lines, biggest }) =>
    joinLines([
      `Spending ${range}:`,
      ...lines,
      ...(biggest ? [`Biggest: ${biggest}.`] : []),
    ]),
  noSpending: (range) => `No spending recorded ${range}.`,
  transactionsList: ({ range, lines, total }) =>
    joinLines([
      `${total} transaction${total === 1 ? "" : "s"} ${range}:`,
      ...lines,
    ]),

  spokenDone: () => "Done.",
  spokenSaved: () => "Okay, saved.",
  spokenDeleted: () => "Deleted.",
  spokenCompleted: () => "Marked as done.",
  spokenReopened: () => "Marked as not done.",

  rangeLabel: (range) => {
    switch (range.label) {
      case "today": return "today";
      case "yesterday": return "yesterday";
      case "thisWeek": return "this week";
      case "lastWeek": return "last week";
      case "lastMonth": return "last month";
      case "thisYear": return "this year";
      case "lastNDays": return `in the last ${range.days} days`;
      case "allTime": return "overall";
      default: return "this month";
    }
  },
  scopePending: () => "pending",
  scopeToday: () => "today's",
  scopeOverdue: () => "overdue",
  scopeCompleted: () => "completed",
  scopeAll: () => "",
};

const HI: Phrases = {
  greeting: () => "नमस्ते! मैं कार्य और रिमाइंडर जोड़ सकता हूँ, उन्हें पूरा कर सकता हूँ, और आपका खर्च देख सकता हूँ। क्या करना है?",
  thanks: () => "आपका स्वागत है!",
  help: () =>
    joinLines([
      "मैं ये कर सकता हूँ:",
      "• कार्य जोड़ना — \"कल शाम 5 बजे माँ को कॉल करने की याद दिलाना\"",
      "• पूरा या हटाना — \"दूध लाना पूरा हो गया\", \"जिम हटा दो\"",
      "• समय बदलना — \"स्टैंडअप शुक्रवार 9 बजे कर दो\"",
      "• कार्य देखना — \"आज क्या बाकी है?\"",
      "• खर्च लिखना — \"500 किराने पर खर्च किए\"",
      "• खर्च देखना — \"इस महीने कितना खर्च हुआ?\"",
    ]),
  outOfScope: () => "मैं सिर्फ़ इस ऐप के कार्य, रिमाइंडर और पैसों में मदद कर सकता हूँ।",
  aiBusy: () =>
    "अभी AI सेवा उपलब्ध नहीं है, इसलिए मैं सिर्फ़ सीधे आदेश समझ सकता हूँ। जैसे \"कल शाम 6 बजे दूध लाना\" या \"इस महीने कितना खर्च हुआ?\"।",
  aiUnavailable: () =>
    "मैं समझ नहीं पाया। सीधा आदेश आज़माएँ, जैसे \"कल शाम 5 बजे माँ को कॉल करने की याद दिलाना\" या \"500 किराने पर खर्च किए\"।",

  needTitle: () => "इस कार्य का नाम क्या रखूँ?",
  taskCreated: ({ title, when, reminder, recurrence }) =>
    `"${title}" ${when} के लिए जोड़ दिया${recurrence ? `, ${recurrence} दोहराएगा` : ""}${reminder ? ", रिमाइंडर के साथ" : ""}।`,
  taskCompleted: (title) => `"${title}" पूरा हो गया।`,
  taskReopened: (title) => `"${title}" फिर से बाकी कर दिया।`,
  taskDeleted: (title) => `"${title}" हटा दिया।`,
  taskRescheduled: ({ title, when }) => `"${title}" को ${when} कर दिया।`,
  taskRenamed: ({ from, to }) => `"${from}" का नाम "${to}" कर दिया।`,
  taskNotFound: (reference) => `"${reference}" नाम का कोई कार्य नहीं मिला।`,
  taskAmbiguous: (titles) =>
    joinLines(["एक से ज़्यादा मिले — कौन सा?", ...titles.map((t) => `• ${t}`)]),
  tasksEmpty: (scope) => `आपके पास कोई ${scope} कार्य नहीं है।`,
  tasksList: ({ lines, total, scope }) =>
    joinLines([
      `आपके ${total} ${scope} कार्य हैं:`,
      ...lines.map((l) => `• ${l.title} — ${l.when}${l.completed ? " (पूरा)" : ""}`),
      ...(total > lines.length ? [`…और ${total - lines.length} बाकी।`] : []),
    ]),

  accountsEmpty: () => "आपका अभी कोई खाता नहीं है।",
  accountNeededForTransaction: () =>
    "पहले एक खाता बनाना होगा — नाम बताइए, जैसे \"घर नाम का खाता बनाओ\"।",
  whichAccount: (names) => joinLines(["कौन सा खाता इस्तेमाल करूँ?", ...names.map((n) => `• ${n}`)]),
  accountCreated: (name) => `"${name}" खाता बना दिया।`,
  accountsList: (names) => joinLines(["आपके खाते:", ...names.map((n) => `• ${n}`)]),

  transactionSaved: ({ inflow, amount, category, account }) =>
    `${account} में ${amount} ${inflow ? "जमा" : "खर्च"}${category ? ` (${category})` : ""} लिख दिया।`,
  transactionConfirm: ({ inflow, amount, category, account }) =>
    `${account} में ${amount} ${inflow ? "जमा" : "खर्च"}${category ? ` (${category})` : ""} सेव करूँ?`,
  transactionDeclined: () => "ठीक है, सेव नहीं किया।",
  summary: ({ inflow, outflow, net, range }) =>
    `${range}: ${inflow} आए, ${outflow} गए — कुल ${net}।`,
  spending: ({ range, lines, biggest }) =>
    joinLines([`${range} का खर्च:`, ...lines, ...(biggest ? [`सबसे बड़ा: ${biggest}।`] : [])]),
  noSpending: (range) => `${range} कोई खर्च दर्ज नहीं है।`,
  transactionsList: ({ range, lines, total }) =>
    joinLines([`${range} ${total} लेनदेन:`, ...lines]),

  spokenDone: () => "हो गया।",
  spokenSaved: () => "ठीक है, सेव कर दिया।",
  spokenDeleted: () => "हटा दिया।",
  spokenCompleted: () => "पूरा कर दिया।",
  spokenReopened: () => "फिर से बाकी कर दिया।",

  rangeLabel: (range) => {
    switch (range.label) {
      case "today": return "आज";
      case "yesterday": return "कल";
      case "thisWeek": return "इस हफ़्ते";
      case "lastWeek": return "पिछले हफ़्ते";
      case "lastMonth": return "पिछले महीने";
      case "thisYear": return "इस साल";
      case "lastNDays": return `पिछले ${range.days} दिनों में`;
      case "allTime": return "कुल";
      default: return "इस महीने";
    }
  },
  scopePending: () => "बाकी",
  scopeToday: () => "आज के",
  scopeOverdue: () => "पिछड़े",
  scopeCompleted: () => "पूरे",
  scopeAll: () => "",
};

const HINGLISH: Phrases = {
  greeting: () => "Namaste! Main tasks aur reminders add kar sakta hoon, complete kar sakta hoon, aur kharcha track kar sakta hoon. Kya karna hai?",
  thanks: () => "Koi baat nahi!",
  help: () =>
    joinLines([
      "Main ye kar sakta hoon:",
      "• Task add — \"kal shaam 5 baje maa ko call karne ki yaad dilana\"",
      "• Complete ya delete — \"doodh lana done\", \"gym hata do\"",
      "• Time badalna — \"standup ko friday 9 baje kar do\"",
      "• Tasks dekhna — \"aaj kya pending hai?\"",
      "• Kharcha likhna — \"500 grocery pe kharch kiye\"",
      "• Kharcha dekhna — \"is mahine kitna kharch hua?\"",
    ]),
  outOfScope: () => "Main sirf is app ke tasks, reminders aur paison mein madad kar sakta hoon.",
  aiBusy: () =>
    "Abhi AI service available nahi hai, isliye main sirf seedhe commands samajh sakta hoon. Jaise \"kal shaam 6 baje doodh lana\" ya \"is mahine kitna kharch hua?\".",
  aiUnavailable: () =>
    "Main samajh nahi paaya. Seedha command try kariye, jaise \"kal shaam 5 baje maa ko call karne ki yaad dilana\" ya \"500 grocery pe kharch kiye\".",

  needTitle: () => "Is task ka naam kya rakhun?",
  taskCreated: ({ title, when, reminder, recurrence }) =>
    `"${title}" ${when} ke liye add kar diya${recurrence ? `, ${recurrence} repeat hoga` : ""}${reminder ? ", reminder ke saath" : ""}.`,
  taskCompleted: (title) => `"${title}" done kar diya.`,
  taskReopened: (title) => `"${title}" wapas pending kar diya.`,
  taskDeleted: (title) => `"${title}" delete kar diya.`,
  taskRescheduled: ({ title, when }) => `"${title}" ko ${when} kar diya.`,
  taskRenamed: ({ from, to }) => `"${from}" ka naam "${to}" kar diya.`,
  taskNotFound: (reference) => `"${reference}" naam ka koi task nahi mila.`,
  taskAmbiguous: (titles) =>
    joinLines(["Ek se zyada mile — kaunsa?", ...titles.map((t) => `• ${t}`)]),
  tasksEmpty: (scope) => `Aapke paas koi ${scope} task nahi hai.`,
  tasksList: ({ lines, total, scope }) =>
    joinLines([
      `Aapke ${total} ${scope} task hain:`,
      ...lines.map((l) => `• ${l.title} — ${l.when}${l.completed ? " (done)" : ""}`),
      ...(total > lines.length ? [`…aur ${total - lines.length} baaki.`] : []),
    ]),

  accountsEmpty: () => "Aapka abhi koi account nahi hai.",
  accountNeededForTransaction: () =>
    "Pehle ek account banana hoga — naam bataiye, jaise \"Home naam ka account banao\".",
  whichAccount: (names) => joinLines(["Kaunsa account use karun?", ...names.map((n) => `• ${n}`)]),
  accountCreated: (name) => `"${name}" account bana diya.`,
  accountsList: (names) => joinLines(["Aapke accounts:", ...names.map((n) => `• ${n}`)]),

  transactionSaved: ({ inflow, amount, category, account }) =>
    `${account} mein ${amount} ${inflow ? "jama" : "kharch"}${category ? ` (${category})` : ""} likh diya.`,
  transactionConfirm: ({ inflow, amount, category, account }) =>
    `${account} mein ${amount} ${inflow ? "jama" : "kharch"}${category ? ` (${category})` : ""} save karun?`,
  transactionDeclined: () => "Theek hai, save nahi kiya.",
  summary: ({ inflow, outflow, net, range }) =>
    `${range}: ${inflow} aaye, ${outflow} gaye — net ${net}.`,
  spending: ({ range, lines, biggest }) =>
    joinLines([`${range} ka kharcha:`, ...lines, ...(biggest ? [`Sabse bada: ${biggest}.`] : [])]),
  noSpending: (range) => `${range} koi kharcha record nahi hai.`,
  transactionsList: ({ range, lines, total }) =>
    joinLines([`${range} ${total} transaction:`, ...lines]),

  spokenDone: () => "Ho gaya.",
  spokenSaved: () => "Theek hai, save kar diya.",
  spokenDeleted: () => "Delete kar diya.",
  spokenCompleted: () => "Done kar diya.",
  spokenReopened: () => "Wapas pending kar diya.",

  rangeLabel: (range) => {
    switch (range.label) {
      case "today": return "aaj";
      case "yesterday": return "kal";
      case "thisWeek": return "is hafte";
      case "lastWeek": return "pichle hafte";
      case "lastMonth": return "pichle mahine";
      case "thisYear": return "is saal";
      case "lastNDays": return `pichle ${range.days} din mein`;
      case "allTime": return "total";
      default: return "is mahine";
    }
  },
  scopePending: () => "pending",
  scopeToday: () => "aaj ke",
  scopeOverdue: () => "overdue",
  scopeCompleted: () => "complete",
  scopeAll: () => "",
};

export function phrasesFor(locale: Locale): Phrases {
  if (locale === "hi") return HI;
  if (locale === "hinglish") return HINGLISH;
  return EN;
}
