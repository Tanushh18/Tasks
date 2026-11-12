import AsyncStorage from "@react-native-async-storage/async-storage";
import { AUTO_TEMPLATES, type AutoTemplate } from "./whatsappAutoTemplates";

/** Messages the person adds on this tablet. They join the built-in ones in the rotation. */
const KEY = "leads.whatsappAuto.custom.v1";
const MAX_CUSTOM = 30;
const MAX_LEN = 1000;

export async function loadCustomMessages(): Promise<AutoTemplate[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as AutoTemplate[]) : [];
    return Array.isArray(list) ? list.filter((m) => m && typeof m.text === "string") : [];
  } catch {
    return [];
  }
}

async function save(list: AutoTemplate[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
}

/** Adds a message to the rotation. Returns the new list; throws a plain message when the text is unusable. */
export async function addCustomMessage(text: string): Promise<AutoTemplate[]> {
  const clean = text.trim();
  if (!clean) throw new Error("Write the message first.");
  if (clean.length > MAX_LEN) throw new Error(`Keep it under ${MAX_LEN} characters.`);
  const list = await loadCustomMessages();
  if (list.length >= MAX_CUSTOM) throw new Error(`You can save up to ${MAX_CUSTOM} messages.`);
  const next = [...list, { id: `u${Date.now()}`, name: `Own message ${list.length + 1}`, text: clean }];
  await save(next);
  return next;
}

export async function removeCustomMessage(id: string): Promise<AutoTemplate[]> {
  const next = (await loadCustomMessages()).filter((m) => m.id !== id);
  await save(next);
  return next;
}

/** Built-in plus the person's own messages: what the rotation picks from. */
export async function messagePool(): Promise<AutoTemplate[]> {
  return [...AUTO_TEMPLATES, ...(await loadCustomMessages())];
}

const SHEET_KEY = "leads.whatsappAuto.sheet.v1";
/** The sheet (lead list) auto send works through. "all" means every sheet. */
export const ALL_SHEETS = "all";

export async function loadSheetChoice(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(SHEET_KEY)) || ALL_SHEETS;
  } catch {
    return ALL_SHEETS;
  }
}

export async function saveSheetChoice(sheet: string): Promise<void> {
  await AsyncStorage.setItem(SHEET_KEY, sheet).catch(() => undefined);
}
