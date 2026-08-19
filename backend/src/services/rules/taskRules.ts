import type { TaskDocument } from "../../models/Task";
import * as taskService from "../taskService";
import { defaultSlot, describeDate, describeTime, parseWhen, type RecurrenceType } from "./datetime";
import { phrasesFor, type TaskLine } from "./phrases";
import { blankSpans, capitalizeFirst, cleanPhrase, tokenCoverage, truncate } from "./text";
import type { RuleContext, RuleOutcome } from "./types";

const MAX_LISTED = 6;
const TITLE_LIMIT = 200;

/** Words that mean "make a reminder", not just "record a task" — they decide whether the created
 * task actually notifies the user. */
const REMIND_TRIGGER = /\b(?:remind|reminder|reminders|alarm|yaad|याद|रिमाइंडर|alert|notify)\b/i;

const CREATE_TRIGGERS: RegExp[] = [
  /\b(?:please\s+)?remind\s+me\s+(?:to|about|that|for)?\b/i,
  /\b(?:set|create|add|make)\s+(?:a|an|the)?\s*(?:new\s+)?(?:reminder|alarm)\s+(?:to|for|about|at)?\b/i,
  /\b(?:set|create|add|make)\s+(?:a|an|the)?\s*(?:new\s+)?task\s*(?:called|named|to|for)?\b/i,
  /\b(?:new|naya|nayi)\s+(?:task|reminder|kaam)\b/i,
  /\b(?:add|create|make)\s+(?:this\s+)?(?:to\s+my\s+)?(?:task\s*list|todo|to-do)\b/i,
  /\b(?:i\s+(?:need|have|want)\s+to)\b/i,
  /\b(?:task|kaam|कार्य)\s+(?:add|jodo|जोड़ो|banao)\s*(?:karo|kar\s+do|kro)?\b/i,
  /\b(?:yaad\s+dilana|yaad\s+dila\s+do|yaad\s+dilaye|याद\s+दिलाना|याद\s+दिला\s+दो)\b/i,
  /\b(?:reminder|alarm)\s+(?:laga|lagao|set)\s*(?:do|kar\s+do)?\b/i,
  /\b(?:add|create|make|jodo)\b/i,
];

const COMPLETE_TRIGGERS: RegExp[] = [
  /\bmark\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(?:done|complete[d]?|finished)\b/i,
  /\b(?:complete|finish|tick\s+off|check\s+off)\s+(?:the\s+)?(.+)$/i,
  /^(.+?)\s+(?:is\s+)?(?:done|complete[d]?|finished)$/i,
  /^(.+?)\s+(?:ho\s+gaya|ho\s+gayi|kar\s+liya|kar\s+li|poora\s+ho\s+gaya|pura\s+ho\s+gaya|complete\s+kar\s+do|done\s+kar\s+do|पूरा\s+हो\s+गया|पूरा\s+कर\s+दो)$/i,
];

const REOPEN_TRIGGERS: RegExp[] = [
  /\bmark\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(?:not\s+done|incomplete|pending|undone)\b/i,
  /\b(?:reopen|unmark|undo)\s+(?:the\s+)?(.+)$/i,
  /^(.+?)\s+(?:pending\s+kar\s+do|wapas\s+pending|baaki\s+hai)$/i,
];

const DELETE_TRIGGERS: RegExp[] = [
  /\b(?:delete|remove|cancel|drop|discard)\s+(?:the\s+)?(?:task\s+)?(.+)$/i,
  /\bget\s+rid\s+of\s+(.+)$/i,
  /^(.+?)\s+(?:hata\s+do|hatao|delete\s+kar\s+do|delete\s+karo|remove\s+kar\s+do|nikal\s+do|हटा\s+दो|हटाओ)$/i,
];

const RESCHEDULE_TRIGGERS: RegExp[] = [
  /\b(?:move|reschedule|shift|postpone|push|change|set)\s+(?:the\s+)?(?:task\s+)?(.+?)\s+(?:to|for|at|till|until)\b/i,
  /^(.+?)\s+(?:ko|ka)\s+(?:time\s+)?(?:badal\s+do|change\s+kar\s+do|kar\s+do)$/i,
];

const RENAME_TRIGGERS: RegExp[] = [/\brename\s+(?:the\s+)?(?:task\s+)?(.+?)\s+to\s+(.+)$/i];

const LIST_TRIGGERS =
  /\b(?:show|list|display|what(?:'s| is| are)?|which|how\s+many|tell\s+me|dikha|dikhao|batao|bata|kya|kitne|कितने|दिखाओ|बताओ|क्या)\b/i;

const TASK_NOUN = /\b(?:task|tasks|todo|todos|to-?do|reminder|reminders|kaam|kaam\s+hai|कार्य|काम|रिमाइंडर)\b/i;

const PRIORITY_HIGH = /\b(?:high\s+priority|urgent|important|asap|zaroori|ज़रूरी|जरूरी)\b/i;
const PRIORITY_LOW = /\b(?:low\s+priority|whenever|not\s+urgent)\b/i;

const ORDINAL_FIRST = /\b(?:first|1st|pehla|pehli|पहला)\b/i;
const ORDINAL_LAST = /\b(?:last|latest|most\s+recent|aakhri|आखिरी)\b/i;

export type TaskResolution =
  | { kind: "found"; task: TaskDocument }
  | { kind: "none" }
  | { kind: "ambiguous"; tasks: TaskDocument[] };

/**
 * Matches what the user called a task against their stored titles. Deliberately lenient — people
 * say "the milk one" for "Buy milk from the store" — but it reports ambiguity rather than guessing
 * when two tasks score alike, because acting on the wrong task is destructive.
 */
export async function resolveTaskReference(
  userId: string,
  reference: string,
  options: { preferIncomplete?: boolean } = {}
): Promise<TaskResolution> {
  const tasks = await taskService.listTasks(userId, { status: "all", sort: "date_asc" });
  if (tasks.length === 0) return { kind: "none" };

  const cleaned = cleanPhrase(reference);

  if (!cleaned) {
    const pending = tasks.filter((t) => !t.completed);
    if (ORDINAL_FIRST.test(reference)) return firstOrNone(pending);
    if (ORDINAL_LAST.test(reference)) return firstOrNone([...pending].reverse());
    // "mark it done" with nothing else to go on is only safe with a single pending task.
    return pending.length === 1 ? { kind: "found", task: pending[0]! } : { kind: "none" };
  }

  const scored = tasks
    .map((task) => ({ task, score: scoreTask(cleaned, task, options.preferIncomplete ?? false) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "none" };

  const top = scored[0]!;
  const rivals = scored.filter((entry) => top.score - entry.score < 8);
  if (rivals.length > 1) {
    return { kind: "ambiguous", tasks: rivals.slice(0, 5).map((entry) => entry.task) };
  }
  return { kind: "found", task: top.task };
}

function firstOrNone(tasks: TaskDocument[]): TaskResolution {
  return tasks.length > 0 ? { kind: "found", task: tasks[0]! } : { kind: "none" };
}

function scoreTask(reference: string, task: TaskDocument, preferIncomplete: boolean): number {
  const title = task.title.toLowerCase();
  const ref = reference.toLowerCase();
  let score = 0;

  if (title === ref) score = 100;
  else if (title.includes(ref)) score = 80 + Math.round((ref.length / Math.max(title.length, 1)) * 10);
  else if (ref.includes(title)) score = 70;
  else {
    const coverage = tokenCoverage(ref, task.title);
    if (coverage >= 0.6) score = 40 + Math.round(coverage * 25);
  }

  if (score > 0 && preferIncomplete && !task.completed) score += 5;
  return score;
}

function localizedRecurrence(type: RecurrenceType, ctx: RuleContext): string {
  const table: Record<RecurrenceType, Record<string, string>> = {
    daily: { en: "daily", hi: "रोज़", hinglish: "roz" },
    weekly: { en: "weekly", hi: "हर हफ़्ते", hinglish: "har hafte" },
    monthly: { en: "monthly", hi: "हर महीने", hinglish: "har mahine" },
  };
  return table[type][ctx.locale] ?? table[type].en!;
}

function describeWhen(date: string, time: string, ctx: RuleContext): string {
  return `${describeDate(date, ctx.now)} at ${describeTime(time)}`;
}

function stripTrigger(text: string, triggers: RegExp[]): { matched: boolean; rest: string } {
  for (const trigger of triggers) {
    const match = text.match(trigger);
    if (!match) continue;
    const start = match.index ?? 0;
    const rest = `${text.slice(0, start)} ${text.slice(start + match[0].length)}`;
    return { matched: true, rest };
  }
  return { matched: false, rest: text };
}

/** Pulls the task name out of the first capture group of whichever trigger matched. */
function captureReference(text: string, triggers: RegExp[]): { matched: boolean; reference: string; extra?: string } {
  for (const trigger of triggers) {
    const match = text.match(trigger);
    if (!match) continue;
    return { matched: true, reference: match[1] ?? "", extra: match[2] };
  }
  return { matched: false, reference: "" };
}

export async function matchTaskIntent(ctx: RuleContext): Promise<RuleOutcome | null> {
  return (
    (await matchRename(ctx)) ??
    (await matchReschedule(ctx)) ??
    (await matchReopen(ctx)) ??
    (await matchComplete(ctx)) ??
    (await matchDelete(ctx)) ??
    (await matchList(ctx)) ??
    matchCreate(ctx)
  );
}

function matchCreate(ctx: RuleContext): RuleOutcome | null {
  const p = phrasesFor(ctx.locale);
  const { matched, rest } = stripTrigger(ctx.text, CREATE_TRIGGERS);
  if (!matched) return null;

  const when = parseWhen(rest, ctx.now);
  let title = cleanPhrase(blankSpans(rest, when.spans));

  // Priority words are instructions, not part of the name.
  const priority = PRIORITY_HIGH.test(title) ? "high" : PRIORITY_LOW.test(title) ? "low" : undefined;
  title = cleanPhrase(title.replace(PRIORITY_HIGH, "").replace(PRIORITY_LOW, ""));
  title = cleanPhrase(title.replace(TASK_NOUN, ""));

  if (!title) return { kind: "reply", reply: p.needTitle(), speech: p.needTitle() };

  const slot = when.date && when.time
    ? { date: when.date, time: when.time }
    : when.date
      ? { date: when.date, time: defaultSlot(ctx.now, when.date).time }
      : when.time
        ? { date: ctx.now.toISODate()!, time: when.time }
        : defaultSlot(ctx.now);

  const reminderEnabled = REMIND_TRIGGER.test(ctx.text) || when.explicitTime;
  const finalTitle = truncate(capitalizeFirst(title), TITLE_LIMIT);

  return {
    kind: "action",
    call: {
      name: "createTask",
      arguments: {
        title: finalTitle,
        date: slot.date,
        time: slot.time,
        reminderEnabled,
        ...(when.recurrence ? { recurrenceType: when.recurrence } : {}),
        ...(priority ? { priority } : {}),
      },
    },
    reply: p.taskCreated({
      title: finalTitle,
      when: describeWhen(slot.date, slot.time, ctx),
      reminder: reminderEnabled,
      recurrence: when.recurrence ? localizedRecurrence(when.recurrence, ctx) : undefined,
    }),
    speech: p.spokenSaved(),
  };
}

async function matchComplete(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  const { matched, reference } = captureReference(ctx.text, COMPLETE_TRIGGERS);
  if (!matched) return null;

  const resolution = await resolveTaskReference(ctx.userId, reference, { preferIncomplete: true });
  const failure = describeResolutionFailure(resolution, reference, ctx);
  if (failure) return failure;
  const task = (resolution as { kind: "found"; task: TaskDocument }).task;

  return {
    kind: "action",
    call: { name: "completeTask", arguments: { taskId: String(task._id), completed: true } },
    reply: p.taskCompleted(task.title),
    speech: p.spokenCompleted(),
  };
}

async function matchReopen(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  const { matched, reference } = captureReference(ctx.text, REOPEN_TRIGGERS);
  if (!matched) return null;

  const resolution = await resolveTaskReference(ctx.userId, reference);
  const failure = describeResolutionFailure(resolution, reference, ctx);
  if (failure) return failure;
  const task = (resolution as { kind: "found"; task: TaskDocument }).task;

  return {
    kind: "action",
    call: { name: "completeTask", arguments: { taskId: String(task._id), completed: false } },
    reply: p.taskReopened(task.title),
    speech: p.spokenReopened(),
  };
}

async function matchDelete(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  const { matched, reference } = captureReference(ctx.text, DELETE_TRIGGERS);
  if (!matched) return null;

  // "delete the 500 grocery transaction" is a finance command, not a task one.
  if (/\b(?:transaction|expense|payment|kharch|लेनदेन)\b/i.test(ctx.text)) return null;

  const resolution = await resolveTaskReference(ctx.userId, reference, { preferIncomplete: true });
  const failure = describeResolutionFailure(resolution, reference, ctx);
  if (failure) return failure;
  const task = (resolution as { kind: "found"; task: TaskDocument }).task;

  return {
    kind: "action",
    call: { name: "deleteTask", arguments: { taskId: String(task._id) } },
    reply: p.taskDeleted(task.title),
    speech: p.spokenDeleted(),
  };
}

async function matchReschedule(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  const { matched, reference } = captureReference(ctx.text, RESCHEDULE_TRIGGERS);
  if (!matched) return null;

  const when = parseWhen(ctx.text, ctx.now);
  // Without a new date or time there is nothing to reschedule to — let the LLM interpret it.
  if (!when.explicitDate && !when.explicitTime) return null;

  const resolution = await resolveTaskReference(ctx.userId, reference, { preferIncomplete: true });
  const failure = describeResolutionFailure(resolution, reference, ctx);
  if (failure) return failure;
  const task = (resolution as { kind: "found"; task: TaskDocument }).task;

  const date = when.date ?? task.date;
  const time = when.time ?? task.time;

  return {
    kind: "action",
    call: { name: "updateTask", arguments: { taskId: String(task._id), date, time } },
    reply: p.taskRescheduled({ title: task.title, when: describeWhen(date, time, ctx) }),
    speech: p.spokenDone(),
  };
}

async function matchRename(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  const { matched, reference, extra } = captureReference(ctx.text, RENAME_TRIGGERS);
  if (!matched || !extra) return null;

  const resolution = await resolveTaskReference(ctx.userId, reference);
  const failure = describeResolutionFailure(resolution, reference, ctx);
  if (failure) return failure;
  const task = (resolution as { kind: "found"; task: TaskDocument }).task;

  const newTitle = truncate(capitalizeFirst(cleanPhrase(extra)), TITLE_LIMIT);
  if (!newTitle) return { kind: "reply", reply: p.needTitle(), speech: p.needTitle() };

  return {
    kind: "action",
    call: { name: "updateTask", arguments: { taskId: String(task._id), title: newTitle } },
    reply: p.taskRenamed({ from: task.title, to: newTitle }),
    speech: p.spokenDone(),
  };
}

async function matchList(ctx: RuleContext): Promise<RuleOutcome | null> {
  const p = phrasesFor(ctx.locale);
  const mentionsTasks = TASK_NOUN.test(ctx.text) || /\b(?:pending|overdue|baaki|बाकी)\b/i.test(ctx.text);
  if (!mentionsTasks || !LIST_TRIGGERS.test(ctx.text)) return null;

  // Creating and listing share words ("add a task" vs "show my tasks") — a create trigger wins.
  if (/\b(?:add|create|make|new|naya|remind\s+me)\b/i.test(ctx.text)) return null;

  let status: "all" | "pending" | "completed" | "overdue" = "pending";
  let scope = p.scopePending();

  if (/\b(?:overdue|late|missed|pichhad|पिछड़े)\b/i.test(ctx.text)) {
    status = "overdue";
    scope = p.scopeOverdue();
  } else if (/\b(?:completed|done|finished|poore|पूरे)\b/i.test(ctx.text)) {
    status = "completed";
    scope = p.scopeCompleted();
  } else if (/\b(?:all|sab|सभी|सब)\b/i.test(ctx.text)) {
    status = "all";
    scope = p.scopeAll();
  }

  const when = parseWhen(ctx.text, ctx.now);
  const date = when.explicitDate ? when.date : undefined;
  if (date && status === "pending" && /\b(?:today|aaj|आज)\b/i.test(ctx.text)) {
    scope = p.scopeToday();
  }

  const tasks = await taskService.listTasks(ctx.userId, { status, date, sort: "date_asc" });
  if (tasks.length === 0) {
    const reply = p.tasksEmpty(scope.trim());
    return { kind: "reply", reply, speech: reply };
  }

  const lines: TaskLine[] = tasks.slice(0, MAX_LISTED).map((task) => ({
    title: task.title,
    when: describeWhen(task.date, task.time, ctx),
    completed: task.completed,
  }));

  const reply = p.tasksList({ lines, total: tasks.length, scope: scope.trim() });
  // Reading a whole list aloud is unhelpful — speak the count and let the screen show the rest.
  const speech = p.tasksList({ lines: [], total: tasks.length, scope: scope.trim() }).split("\n")[0]!;
  return { kind: "reply", reply, speech };
}

function describeResolutionFailure(
  resolution: TaskResolution,
  reference: string,
  ctx: RuleContext
): RuleOutcome | null {
  const p = phrasesFor(ctx.locale);
  if (resolution.kind === "none") {
    const cleaned = cleanPhrase(reference);
    // With nothing usable to search for, the LLM has a better chance than a "not found" dead end.
    if (!cleaned) return null;
    const reply = p.taskNotFound(cleaned);
    return { kind: "reply", reply, speech: reply };
  }
  if (resolution.kind === "ambiguous") {
    const reply = p.taskAmbiguous(resolution.tasks.map((task) => task.title));
    return { kind: "reply", reply, speech: reply.split("\n")[0]! };
  }
  return null;
}
