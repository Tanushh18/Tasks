import fs from "node:fs";
import path from "node:path";
import { Lead } from "../models/Lead";
import { LeadList } from "../models/LeadList";
import { User } from "../models/User";
import { logger } from "../utils/logger";
import { escapeRegex } from "./rules/text";
import { addManualLeads, ensureList, type NewLead } from "./leadService";

export const OLF_LIST = "OLF Data";
const OLF_KEY = OLF_LIST.toLowerCase();

interface OlfRow {
  name: string;
  phone: string;
  phone2?: string;
}

/** backend/data/olfData.json: resolved from both src/services (tsx) and dist/services (built). */
export function loadOlfRows(): OlfRow[] {
  const file = path.resolve(__dirname, "../../data/olfData.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as OlfRow[];
}

export interface OlfSeedResult {
  ran: boolean;
  reason?: "already-seeded" | "has-leads" | "no-admin";
  total: number;
  added: number;
  existing: number;
  invalid: number;
}

const empty = (reason: OlfSeedResult["reason"], total = 0): OlfSeedResult => ({ ran: false, reason, total, added: 0, existing: 0, invalid: 0 });

/**
 * Loads the "OLF Data" list once. These leads are never linked to a sheet (no LeadSource of kind sheet/import), so the
 * sync job, which only reads connected sheets and only ever adds/links, can't touch or archive them.
 *
 * Idempotent: the LeadList "OLF Data" carries `seededAt`. It is claimed atomically before any lead is written, so two
 * servers booting together can't both seed, and contacts a user deletes later are never added back by a later boot.
 * `force` (the admin endpoint) ignores the marker; numbers already present are still left alone.
 */
export async function seedOlfData(opts: { userId?: string; force?: boolean } = {}): Promise<OlfSeedResult> {
  const rows = loadOlfRows();
  const items: NewLead[] = rows.map((r) => ({ name: r.name, phone: r.phone, alternatePhones: r.phone2 ? [r.phone2] : [] }));

  if (!opts.force) {
    const list = await LeadList.findOne({ key: OLF_KEY }).lean();
    if (list?.seededAt) return empty("already-seeded", rows.length);
    if (await Lead.exists({ origin: new RegExp(`^${escapeRegex(OLF_LIST)}$`, "i") })) {
      // Someone already created leads under this name by hand: never pile the built-in contacts on top.
      await ensureList(OLF_LIST);
      await LeadList.updateOne({ key: OLF_KEY, seededAt: null }, { $set: { seededAt: new Date() } });
      return empty("has-leads", rows.length);
    }
  }

  let userId = opts.userId;
  if (!userId) {
    const admin = await User.findOne({ isAdmin: true }).sort({ createdAt: 1, _id: 1 }).select("_id").lean();
    if (!admin) return empty("no-admin", rows.length); // retried on the next boot
    userId = String(admin._id);
  }

  await ensureList(OLF_LIST, userId);
  if (!opts.force) {
    const claimed = await LeadList.findOneAndUpdate({ key: OLF_KEY, seededAt: null }, { $set: { seededAt: new Date() } });
    if (!claimed) return empty("already-seeded", rows.length);
  }
  try {
    const { added, existing, invalid } = await addManualLeads(userId, items, OLF_LIST);
    if (opts.force) await LeadList.updateOne({ key: OLF_KEY }, { $set: { seededAt: new Date() } });
    return { ran: true, total: rows.length, added, existing, invalid };
  } catch (err) {
    if (!opts.force) await LeadList.updateOne({ key: OLF_KEY }, { $set: { seededAt: null } }); // let the next boot retry
    throw err;
  }
}

/** Boot hook: can never crash startup. */
export async function seedOlfDataOnBoot(): Promise<void> {
  try {
    const r = await seedOlfData();
    if (r.ran) logger.info(`Seeded "${OLF_LIST}": ${r.added} added, ${r.existing} already existed, ${r.invalid} invalid`);
    else if (r.reason === "no-admin") logger.info(`"${OLF_LIST}" not seeded yet: no admin user exists; will retry on next boot`);
  } catch (err) {
    logger.error("OLF Data seed failed", { message: err instanceof Error ? err.message : String(err) });
  }
}
