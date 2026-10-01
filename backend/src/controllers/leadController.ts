import type { Request, Response } from "express";
import { Lead } from "../models/Lead";
import { LeadSource } from "../models/LeadSource";
import { User } from "../models/User";
import { STATUS_SUGGESTIONS, accessibleSources, leadAccessFilter, parseLeadSourceUrl, syncSource } from "../services/leadService";
import { escapeRegex } from "../services/rules/text";

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : undefined;

export async function listLeads(req: Request, res: Response) {
  const archived = req.query.archived === "true";
  const search = str(req.query.search as string, 120);

  const filter: Record<string, unknown> = {
    ...(archived ? {} : { archived: false }),
  };
  const and: Record<string, unknown>[] = [await leadAccessFilter(req.userId!)];

  if (search) {
    const escapedSearch = escapeRegex(search);
    const phoneSearch = search.replace(/\D/g, "");

    and.push({
      $or: [
        { name: new RegExp(escapedSearch, "i") },
        { phone: new RegExp(escapeRegex(phoneSearch), "i") },
        { status: new RegExp(escapedSearch, "i") },
      ],
    });
  }
  filter.$and = and;

  const leads = await Lead.find(filter).sort({ sheetDate: -1, _id: -1 }).lean();
  res.json({
    leads: leads.map((l) => ({
      ...l,
      id: String(l._id),
      _id: undefined,
      ownerId: undefined,
      sourceIds: l.sourceIds.map(String),
    })),
  });
}

export async function updateLead(req: Request, res: Response) {
  const lead = await Lead.findOne({
    _id: req.params.id,
    ...(await leadAccessFilter(req.userId!)),
  });

  if (!lead) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Lead not found" },
    });
  }

  const b = req.body || {};

  if ("category" in b) lead.category = str(b.category, 80) || "";
  if ("status" in b) lead.status = str(b.status, 200) || "";

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
  })) {
    if (k in b) (lead as any)[k] = str(b[k], max) || "";
  }

  await lead.save();
  return res.json({
    lead: {
      ...lead.toObject(),
      id: String(lead._id),
      _id: undefined,
    },
  });
}

async function serializeSource(source: any, userId: string) {
  const memberIds = (source.sharedWith ?? []) as unknown[];
  const members = memberIds.length
    ? await User.find({ _id: { $in: memberIds } }, { name: 1, mobileNumber: 1 }).lean()
    : [];
  const { _id, ownerId, lastHash, sharedWith, ...rest } = source;
  return {
    ...rest,
    id: String(_id),
    isOwner: String(ownerId) === userId,
    sharedWith: members.map((m) => ({ id: String(m._id), name: m.name, mobileNumber: m.mobileNumber })),
  };
}

const notFound = (res: Response, message = "Sheet not found") =>
  res.status(404).json({ error: { code: "NOT_FOUND", message } });

export async function listSources(req: Request, res: Response) {
  const sources = (await accessibleSources(req.userId!)).sort(
    (a: any, b: any) => +new Date(a.createdAt) - +new Date(b.createdAt)
  );
  const out = await Promise.all(sources.map((s) => serializeSource(s.toObject(), req.userId!)));
  res.json({ sources: out });
}

export async function addSource(req: Request, res: Response) {
  const url = str(req.body?.url, 1000) || "";
  const ref = parseLeadSourceUrl(url);

  if (!ref) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Paste a Google Sheets link",
      },
    });
  }

  const source = await LeadSource.create({
    ownerId: req.userId,
    url,
    ...ref,
  });

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

  if (source.enabled)
    await syncSource(source.toObject(), req.userId!, true).catch(() => {});

  return res.json({ source: await serializeSource(source.toObject(), req.userId!) });
}

export async function shareSource(req: Request, res: Response) {
  const source = await LeadSource.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!source) return notFound(res);

  const mobileNumber = (str(req.body?.mobileNumber, 20) || "").replace(/\D/g, "").slice(-10);
  const user = mobileNumber ? await User.findOne({ mobileNumber }) : null;
  if (!user) return notFound(res, "No user found with that mobile number");
  if (String(user._id) === req.userId) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "This sheet is already yours" },
    });
  }

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
  const sources = (await accessibleSources(req.userId!)).filter((s) => s.enabled);

  const results = [];
  for (const source of sources)
    results.push(await syncSource(source.toObject(), String(source.ownerId), true));

  res.json({ results });
}

export async function meta(_req: Request, res: Response) {
  res.json({
    statusSuggestions: STATUS_SUGGESTIONS,
    syncIntervalSeconds: 15,
  });
}
