import type { Request, Response } from "express";
import { Lead } from "../models/Lead";
import { LeadSource } from "../models/LeadSource";
import { STATUS_SUGGESTIONS, parseLeadSourceUrl, syncSource } from "../services/leadService";
import { escapeRegex } from "../services/rules/text";

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : undefined;

export async function listLeads(req: Request, res: Response) {
  const archived = req.query.archived === "true";
  const search = str(req.query.search as string, 120);

  const filter: Record<string, unknown> = {
    ownerId: req.userId,
    ...(archived ? {} : { archived: false }),
  };

  if (search) {
    const escapedSearch = escapeRegex(search);
    const phoneSearch = search.replace(/\D/g, "");

    filter.$or = [
      { name: new RegExp(escapedSearch, "i") },
      { phone: new RegExp(escapeRegex(phoneSearch), "i") },
      { status: new RegExp(escapedSearch, "i") },
    ];
  }

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
    ownerId: req.userId,
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

export async function listSources(req: Request, res: Response) {
  const sources = await LeadSource.find({ ownerId: req.userId })
    .sort({ createdAt: 1 })
    .lean();

  res.json({
    sources: sources.map((s) => ({
      ...s,
      id: String(s._id),
      _id: undefined,
      ownerId: undefined,
      lastHash: undefined,
    })),
  });
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

  try {
    const result = await syncSource(source.toObject(), req.userId!, true);
    const fresh = await LeadSource.findById(source._id).lean();
    return res.status(201).json({
      source: {
        ...fresh,
        id: String(fresh!._id),
        _id: undefined,
        ownerId: undefined,
        lastHash: undefined,
      },
      result,
    });
  } catch (err) {
    await LeadSource.updateOne(
      { _id: source._id },
      { lastError: err instanceof Error ? err.message : String(err) }
    );
    return res.status(201).json({
      source: {
        ...source.toObject(),
        id: String(source._id),
        _id: undefined,
        ownerId: undefined,
        lastHash: undefined,
      },
      result: {
        changed: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export async function updateSource(req: Request, res: Response) {
  const source = await LeadSource.findOne({
    _id: req.params.id,
    ownerId: req.userId,
  });

  if (!source) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Sheet not found" },
    });
  }

  if (typeof req.body?.enabled === "boolean") source.enabled = req.body.enabled;
  if (typeof req.body?.label === "string")
    source.label = req.body.label.trim().slice(0, 80);

  await source.save();

  if (source.enabled)
    await syncSource(source.toObject(), req.userId!, true).catch(() => {});

  return res.json({
    source: {
      ...source.toObject(),
      id: String(source._id),
      _id: undefined,
      ownerId: undefined,
      lastHash: undefined,
    },
  });
}

export async function deleteSource(req: Request, res: Response) {
  const source = await LeadSource.findOneAndDelete({
    _id: req.params.id,
    ownerId: req.userId,
  });

  if (!source) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Sheet not found" },
    });
  }

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
  const sources = await LeadSource.find({
    ownerId: req.userId,
    enabled: true,
  }).lean();

  const results = [];
  for (const source of sources)
    results.push(await syncSource(source, req.userId!, true));

  res.json({ results });
}

export async function meta(_req: Request, res: Response) {
  res.json({
    statusSuggestions: STATUS_SUGGESTIONS,
    syncIntervalSeconds: 15,
  });
}
