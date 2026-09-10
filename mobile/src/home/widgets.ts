import { getJson, setJson } from "../offline/storage";

export type WidgetId = "today" | "money" | "comingUp" | "activity";

export interface WidgetDefinition {
  id: WidgetId;
  label: string;
  description: string;
}

/** Quick Actions aren't in this list — they're a fixed anchor above everything else
 * (spec §37's "three taps or fewer" applies most to them), not a reorderable widget. */
export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  { id: "today", label: "Today", description: "Tasks, reminders and money due today" },
  { id: "money", label: "Money this month", description: "In, out and net for this month" },
  { id: "comingUp", label: "Coming up", description: "Your next few reminders" },
  { id: "activity", label: "Family activity", description: "What your family has been up to" },
];

const DEFAULT_ORDER: WidgetId[] = ["today", "money", "comingUp", "activity"];
const STORAGE_KEY = "dt_home_widget_prefs";

export interface WidgetPrefs {
  order: WidgetId[];
  hidden: WidgetId[];
}

const DEFAULT_PREFS: WidgetPrefs = { order: DEFAULT_ORDER, hidden: [] };

/** Repairs a stored preference list against the current widget set, so adding
 * or removing a widget in a future release never leaves a stale/missing id. */
function sanitize(prefs: WidgetPrefs): WidgetPrefs {
  const known = new Set(WIDGET_DEFINITIONS.map((w) => w.id));
  const order = prefs.order.filter((id) => known.has(id));
  for (const id of DEFAULT_ORDER) {
    if (!order.includes(id)) order.push(id);
  }
  const hidden = prefs.hidden.filter((id) => known.has(id));
  return { order, hidden };
}

export async function getWidgetPrefs(): Promise<WidgetPrefs> {
  const stored = await getJson<WidgetPrefs>(STORAGE_KEY);
  return sanitize(stored ?? DEFAULT_PREFS);
}

export async function setWidgetPrefs(prefs: WidgetPrefs): Promise<void> {
  await setJson(STORAGE_KEY, sanitize(prefs));
}

export function moveWidget(order: WidgetId[], id: WidgetId, direction: "up" | "down"): WidgetId[] {
  const index = order.indexOf(id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= order.length) return order;
  const next = [...order];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}
