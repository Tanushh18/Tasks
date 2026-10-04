import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Lead } from "../models/Lead";
import { LeadSource } from "../models/LeadSource";
import { LeadTombstone } from "../models/LeadTombstone";
import { User } from "../models/User";
import { fetchSheet, objectsToRows, parseCsv, parseTabs } from "../services/leadImport";
import {
  STATUS_SUGGESTIONS,
  NOT_INTERESTED_TTL_DAYS,
  addManualLeads,
  accessibleSources,
  existingPhones,
  importParsedLeads,
  isNotInterested,
  leadAccessFilter,
  normalizePhone,
  parseLeadSourceUrl,
  syncSource,
} from "../services/leadService";
import { escapeRegex } from "../services/rules/text";

/** Owner of leads sent to the no-auth bulk import when no `ownerMobile` is given. */
const DEFAULT_IMPORT_OWNER = "8130483894";

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : undefined;

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });

const NEW_STATUS = /^\s*(new)?\s*$/i;

function serializeLead(l: any) {
  const { _id, ownerId, updatedById, __v, ...rest } = l;
  return {
    ...rest,
    id: String(_id),
    sourceIds: (l.sourceIds ?? []).map(String),
    alternatePhones: l.alternatePhones ?? [],
  };
}

export async function listLeads(req: Request, res: Response) {
  const archived = req.query.archived === "true";
  const search = str(req.query.search as string, 120);
  const status = str(req.query.status as string, 200);
  const sourceId = str(req.query.sourceId as string, 40);
  // Old app versions don't send `page` and expect every lead back in one go.
  const paged = req.query.page !== undefined;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));

  const base: Record<string, unknown>[] = [await leadAccessFilter(req.userId!)];
  if (!archived) base.push({ archived: false });
  // One list only (e.g. Meta leads or Calling data); "all"/absent means every list combined.
  if (sourceId && sourceId.toLowerCase() !== "all") {
    if (!Types.ObjectId.isValid(sourceId)) return badRequest(res, "Unknown lead list");
    base.push({ sourceIds: new Types.ObjectId(sourceId) });
  }

  if (search) {
    const escapedSearch = escapeRegex(search);
    const phoneSearch = search.replace(/\D/g, "");
    const or: Record<string, unknown>[] = [
      { name: new RegExp(escapedSearch, "i") },
      { status: new RegExp(escapedSearch, "i") },
      { notes: new RegExp(escapedSearch, "i") },
      { info: new RegExp(escapedSearch, "i") },
    ];
    if (phoneSearch.length >= 3) or.push({ phone: new RegExp(escapeRegex(phoneSearch)) });
    base.push({ $or: or });
  }

  const filter: Record<string, unknown> = { $and: [...base] };
  if (status && status.toLowerCase() !== "all") {
    (filter.$and as unknown[]).push(
      NEW_STATUS.test(status) ? { status: { $regex: NEW_STATUS } } : { status }
    );
  }

  const sort = { createdAt: -1 as const, _id: -1 as const };
  if (!paged) {
    const leads = await Lead.find(filter).sort(sort).lean();
    return res.json({ leads: leads.map(serializeLead) });
  }

  // Two queries per page: the page itself and one grouped count. Totals come from the group, so
  // there is no separate countDocuments for the page total or for "all".
  const [leads, grouped] = await Promise.all([
    Lead.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Lead.aggregate<{ _id: string; count: number }>([
      { $match: { $and: base } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const counts = new Map<string, number>();
  let totalAll = 0;
  let total = 0;
  const wantAll = !status || status.toLowerCase() === "all";
  const wantNew = !wantAll && NEW_STATUS.test(status!);
  for (const g of grouped) {
    const raw = g._id ?? "";
    const key = NEW_STATUS.test(raw) ? "New" : String(raw).trim();
    counts.set(key, (counts.get(key) ?? 0) + g.count);
    totalAll += g.count;
    if (wantAll || (wantNew ? NEW_STATUS.test(raw) : raw === status)) total += g.count;
  }

  return res.json({
    leads: leads.map(serializeLead),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalAll,
    stageCounts: [...counts.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count),
  });
}

export async function updateLead(req: Request, res: Response) {
  const access = await leadAccessFilter(req.userId!);
  const lead = await Lead.findOne({ _id: req.params.id, ...access });

  if (!lead) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Lead not found" },
    });
  }

  const b = req.body || {};

  if ("name" in b) lead.name = str(b.name, 120) || "";

  if ("phone" in b) {
    const phone = normalizePhone(typeof b.phone === "string" ? b.phone : "");
    if (!phone) return badRequest(res, "Enter a valid 10-digit Indian mobile number");
    if (phone !== lead.phone) {
      const clash = await Lead.findOne({ _id: { $ne: lead._id }, phone, ...access }, { _id: 1 }).lean();
      if (clash) {
        return res.status(409).json({ error: { code: "CONFLICT", message: "Another lead already has this number" } });
      }
      if (!lead.alternatePhones.includes(lead.phone)) lead.alternatePhones.push(lead.phone);
      lead.alternatePhones = lead.alternatePhones.filter((p) => p !== phone) as any;
      lead.phone = phone;
    }
  }

  if ("category" in b) lead.category = str(b.category, 80) || "";
  if ("status" in b) {
    const next = str(b.status, 200) || "";
    if (next !== lead.status) {
      lead.status = next;
      lead.statusUpdatedAt = new Date();
      lead.notInterestedAt = isNotInterested(next) ? lead.notInterestedAt ?? new Date() : null;
    }
  }

  if ("plotInFarukhNagar" in b) {
    lead.plotManual = b.plotInFarukhNagar !== null;
    if (lead.plotManual)
      lead.plotInFarukhNagar = str(b.plotInFarukhNagar, 120) || "";
  }

  for (const [k, max] of Object.entries({
    requirement: 2000,
    address: 500,
    budget: 100,
    notes: 4000,
    email: 200,
  })) {
    if (k in b) (lead as any)[k] = str(b[k], max) || "";
  }

  const me = await User.findById(req.userId).select("name").lean();
  lead.updatedById = new Types.ObjectId(req.userId!);
  lead.updatedByName = me?.name ?? "";

  try {
    await lead.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return res.status(409).json({ error: { code: "CONFLICT", message: "Another lead already has this number" } });
    }
    throw err;
  }
  return res.json({ lead: serializeLead(lead.toObject()) });
}

/** Admin only. Removes the lead and remembers its number so a sheet sync doesn't bring it back. */
export async function deleteLead(req: Request, res: Response) {
  if (!req.isAdmin) return adminOnly(res);
  if (!Types.ObjectId.isValid(req.params.id)) return notFound(res, "Lead not found");
  const access = await leadAccessFilter(req.userId!);
  const lead = await Lead.findOneAndDelete({ _id: req.params.id, ...access });
  if (!lead) return notFound(res, "Lead not found");
  await LeadTombstone.updateOne(
    { ownerId: lead.ownerId, phone: lead.phone },
    { $set: { deletedAt: new Date() } },
    { upsert: true }
  );
  return res.status(204).send();
}

/** Friendly names for the two sheets this app is used with, shown whatever label they were added under. */
const KNOWN_SHEET_LABELS: Record<string, string> = {
  "1Nv1japYjs6HY3_R5lJTDEMW4vPrEOdXbEvJH4aRznZs": "Meta Sheet",
  "1yJHK8tnURvrudVPt-PHYzVCtve5ScRa9uVCA6AqFM1U": "Calling Data",
};

async function serializeSource(source: any, userId: string) {
  const memberIds = (source.sharedWith ?? []) as unknown[];
  const members = memberIds.length
    ? await User.find({ _id: { $in: memberIds } }, { name: 1, mobileNumber: 1 }).lean()
    : [];
  const { _id, ownerId, lastHash, sharedWith, __v, ...rest } = source;
  const isOwner = String(ownerId) === userId;
  const out: Record<string, unknown> = {
    ...rest,
    label: KNOWN_SHEET_LABELS[rest.sheetId as string] ?? rest.label,
    id: String(_id),
    kind: rest.kind ?? "sheet",
    allTabs: rest.gid === "all",
    isOwner,
    sharedWith: members.map((m) => ({ id: String(m._id), name: m.name, mobileNumber: m.mobileNumber })),
  };
  // People a list is shared with see its name, not the owner's sheet link or sync errors.
  if (!isOwner) {
    delete out.url;
    delete out.sheetId;
    delete out.gid;
    delete out.lastError;
  }
  return out;
}

const notFound = (res: Response, message = "Sheet not found") =>
  res.status(404).json({ error: { code: "NOT_FOUND", message } });

const adminOnly = (res: Response) =>
  res.status(403).json({ error: { code: "FORBIDDEN", message: "Only the admin can do this" } });

export async function listSources(req: Request, res: Response) {
  const sources = (await accessibleSources(req.userId!)).sort(
    (a: any, b: any) => +new Date(a.createdAt) - +new Date(b.createdAt)
  );
  const out = await Promise.all(sources.map((s) => serializeSource(s.toObject(), req.userId!)));
  res.json({ sources: out });
}

export async function addSource(req: Request, res: Response) {
  if (!req.isAdmin) return adminOnly(res);
  const url = str(req.body?.url, 1000) || "";
  const ref = parseLeadSourceUrl(url, req.body?.allTabs === true);

  if (!ref) return badRequest(res, "Paste a Google Sheets link");

  let source;
  try {
    source = await LeadSource.create({
      ownerId: req.userId,
      url,
      label: str(req.body?.label, 80) || "",
      ...ref,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return res.status(409).json({
        error: { code: "CONFLICT", message: "This sheet is already added" },
      });
    }
    throw err;
  }

  let result: Record<string, unknown>;
  try {
    result = await syncSource(source.toObject(), req.userId!, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await LeadSource.updateOne({ _id: source._id }, { lastError: message });
    result = { changed: false, error: message };
  }
  const fresh = await LeadSource.findById(source._id).lean();
  return res.status(201).json({ source: await serializeSource(fresh, req.userId!), result });
}

export async function updateSource(req: Request, res: Response) {
  const source = await LeadSource.findOne({
    _id: req.params.id,
    ownerId: req.userId,
  });

  if (!source) return notFound(res);

  if (typeof req.body?.enabled === "boolean") source.enabled = req.body.enabled;
  if (typeof req.body?.label === "string")
    source.label = req.body.label.trim().slice(0, 80);

  await source.save();

  if (source.enabled && source.kind === "sheet")
    await syncSource(source.toObject(), req.userId!, true).catch(() => {});

  return res.json({ source: await serializeSource(source.toObject(), req.userId!) });
}

export async function shareSource(req: Request, res: Response) {
  const source = await LeadSource.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!source) return notFound(res);

  const mobileNumber = (str(req.body?.mobileNumber, 20) || "").replace(/\D/g, "").slice(-10);
  const user = mobileNumber ? await User.findOne({ mobileNumber }) : null;
  if (!user) return notFound(res, "No user found with that mobile number");
  if (String(user._id) === req.userId) return badRequest(res, "This sheet is already yours");

  await LeadSource.updateOne({ _id: source._id }, { $addToSet: { sharedWith: user._id } });
  const fresh = await LeadSource.findById(source._id).lean();
  return res.json({ source: await serializeSource(fresh, req.userId!) });
}

export async function unshareSource(req: Request, res: Response) {
  // The owner can remove anyone; a shared member can remove only themselves.
  const filter =
    req.params.userId === req.userId
      ? { _id: req.params.id, $or: [{ ownerId: req.userId }, { sharedWith: req.userId }] }
      : { _id: req.params.id, ownerId: req.userId };
  const source = await LeadSource.findOneAndUpdate(
    filter,
    { $pull: { sharedWith: req.params.userId } },
    { new: true }
  ).lean();
  if (!source) return notFound(res);
  return res.json({ source: await serializeSource(source, req.userId!) });
}

export async function deleteSource(req: Request, res: Response) {
  const source = await LeadSource.findOneAndDelete({
    _id: req.params.id,
    ownerId: req.userId,
    kind: { $ne: "manual" },
  });

  if (!source) return notFound(res);

  // Leads belong to the sheet owner's workspace; detach them from the deleted source.
  await Lead.updateMany(
    { ownerId: req.userId, sourceIds: source._id },
    { $pull: { sourceIds: source._id } }
  );

  await Lead.updateMany(
    { ownerId: req.userId, sourceIds: { $size: 0 } },
    { $set: { archived: true } }
  );

  return res.status(204).send();
}

export async function syncAll(req: Request, res: Response) {
  const sources = (await accessibleSources(req.userId!)).filter((s) => s.enabled && s.kind === "sheet");

  const results = [];
  for (const source of sources) {
    try {
      results.push(await syncSource(source.toObject(), String(source.ownerId), true));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await LeadSource.updateOne({ _id: source._id }, { lastCheckedAt: new Date(), lastError: message });
      results.push({ changed: false, error: message });
    }
  }

  res.json({ results });
}

export async function meta(req: Request, res: Response) {
  res.json({
    statusSuggestions: STATUS_SUGGESTIONS,
    syncIntervalSeconds: 15,
    notInterestedTtlDays: NOT_INTERESTED_TTL_DAYS,
    isAdmin: !!req.isAdmin,
  });
}

const MAX_IMPORT = 2000;

export async function importLeads(req: Request, res: Response) {
  const raw = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  if (raw.length === 0 || raw.length > MAX_IMPORT) {
    return badRequest(res, `Send between 1 and ${MAX_IMPORT} contacts`);
  }
  const contacts = raw.map((c: Record<string, unknown>) => ({
    name: str(c?.name, 120),
    phone: str(c?.phone, 40),
    status: str(c?.status, 200),
    category: str(c?.category, 80),
    notes: str(c?.notes, 4000),
  }));
  const { added, existing, invalid } = await addManualLeads(req.userId!, contacts);
  return res.status(201).json({ added, existing, invalid });
}

/** Which of the given numbers are already leads, so the contact-suggestion popup can hide them. */
export async function lookupPhones(req: Request, res: Response) {
  const phones = Array.isArray(req.body?.phones) ? req.body.phones.filter((p: unknown) => typeof p === "string").slice(0, 5000) : [];
  res.json({ existing: await existingPhones(req.userId!, phones) });
}

const truthy = (v: unknown) => v === true || v === "true" || v === "1" || v === 1;

/** Reads whatever was sent (a sheet link, CSV text, several CSV files or JSON rows) into tabs of rows. */
async function collectTabs(b: Record<string, any>) {
  const sheetUrl = str(b.sheetUrl ?? b.url, 1000);
  const label = str(b.label, 80);
  if (typeof b.csv === "string" && b.csv.trim()) {
    const name = label || str(b.fileName, 80) || "CSV import";
    return { label: name, tabs: [{ tab: str(b.fileName, 80) || name, rows: parseCsv(b.csv) }] };
  }
  if (Array.isArray(b.files) && b.files.length) {
    const tabs = b.files
      .filter((f: any) => typeof f?.csv === "string")
      .map((f: any, i: number) => ({ tab: str(f.name, 80) || `File ${i + 1}`, rows: parseCsv(f.csv) }));
    return { label: label || "CSV import", tabs };
  }
  if (Array.isArray(b.rows) && b.rows.length) {
    return { label: label || "API import", tabs: [{ tab: label || "rows", rows: objectsToRows(b.rows) }] };
  }
  if (sheetUrl) {
    const only = Array.isArray(b.tabs) ? b.tabs.map(String) : typeof b.tabs === "string" && b.tabs ? b.tabs.split(",") : undefined;
    const sheet = await fetchSheet(sheetUrl, { allTabs: truthy(b.allTabs), only });
    return {
      label: label || "Google Sheet import",
      tabs: sheet.tabs.map((t) => ({ tab: t.tab, rows: parseCsv(t.csv) })),
    };
  }
  return null;
}

async function runImport(req: Request, res: Response, ownerId: string, owner: { name: string; mobileNumber: string }) {
  const b: Record<string, any> =
    typeof req.body === "string" ? { ...req.query, csv: req.body } : { ...req.query, ...(req.body ?? {}) };
  let collected;
  try {
    collected = await collectTabs(b);
  } catch (err) {
    return badRequest(res, err instanceof Error ? err.message : String(err));
  }
  if (!collected || !collected.tabs.length) {
    return badRequest(res, "Send one of: sheetUrl, csv, files[{name,csv}], or rows[{name,phone,...}]");
  }
  const parsed = parseTabs(collected.tabs);
  const dryRun = truthy(b.dryRun);
  if (truthy(b.namesOnly)) {
    // Corrects names of leads that already exist (matched by mobile). Writes the name field and nothing else:
    // no new leads, no lists, and stage / notes / category etc. are never touched.
    const owner = new Types.ObjectId(ownerId);
    const changes: { phone: string; from: string; to: string }[] = [];
    for (const l of parsed.leads) {
      if (!l.name || /test lead/i.test(l.name)) continue;
      const cur = await Lead.findOne({ ownerId: owner, phone: l.phone }, { name: 1 }).lean();
      if (!cur || cur.name === l.name) continue;
      changes.push({ phone: l.phone, from: cur.name ?? "", to: l.name });
      if (!dryRun) await Lead.updateOne({ _id: cur._id }, { $set: { name: l.name } });
    }
    return res.json({ dryRun, namesOnly: true, owner, checked: parsed.leads.length, changed: changes.length, changes });
  }
  const result = await importParsedLeads(ownerId, parsed, {
    label: collected.label,
    dryRun,
    includeDeleted: truthy(b.includeDeleted),
  });
  const rejectedLimit = truthy(b.allRejected) ? 500 : 50;
  return res.status(dryRun ? 200 : 201).json({
    dryRun,
    owner,
    source: result.source,
    summary: result.summary,
    tabs: parsed.reports,
    rejected: parsed.rejected.slice(0, rejectedLimit),
    sample: parsed.leads.slice(0, 5),
  });
}

/** Admin-only, signed in: the in-app "Import CSV" / "Import from sheet" button. */
export async function adminImport(req: Request, res: Response) {
  if (!req.isAdmin) return adminOnly(res);
  const me = await User.findById(req.userId).select("name mobileNumber").lean();
  return runImport(req, res, req.userId!, { name: me?.name ?? "", mobileNumber: me?.mobileNumber ?? "" });
}

/**
 * No sign-in needed (see README "Bulk lead import"): loads leads into the account of `ownerMobile`
 * (default: the admin). Meant for scripts / curl when adding large batches.
 */
export async function publicBulkImport(req: Request, res: Response) {
  const raw = String((req.body && typeof req.body === "object" ? req.body.ownerMobile : undefined) ?? req.query.ownerMobile ?? DEFAULT_IMPORT_OWNER);
  const mobileNumber = raw.replace(/\D/g, "").slice(-10);
  const owner = await User.findOne({ mobileNumber }).select("name mobileNumber").lean();
  if (!owner) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: `No account with mobile ${mobileNumber}. Sign up in the app first.` },
    });
  }
  return runImport(req, res, String(owner._id), { name: owner.name, mobileNumber: owner.mobileNumber });
}
