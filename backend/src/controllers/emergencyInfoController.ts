import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as emergencyInfoService from "../services/emergencyInfoService";
import type { EmergencyInfoDocument } from "../models/EmergencyInfo";

// Never log any part of `doc` above/below this serializer — emergency info is
// sensitive personal data (medical notes, home access details).
function serialize(doc: EmergencyInfoDocument) {
  return {
    id: String(doc._id),
    ownerId: String(doc.ownerId),
    emergencyContacts: doc.emergencyContacts,
    medicalNotes: doc.medicalNotes,
    homeInfo: doc.homeInfo,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const EMPTY = { emergencyContacts: [] as unknown[], medicalNotes: "", homeInfo: "" };

export const getOwnInfo = asyncHandler(async (req: Request, res: Response) => {
  const info = await emergencyInfoService.getOwnInfo(req.userId!);
  res.json({ info: info ? serialize(info) : { ownerId: req.userId, ...EMPTY } });
});

export const getInfoForUser = asyncHandler(async (req: Request, res: Response) => {
  const info = await emergencyInfoService.getInfoForUser(req.params.userId);
  res.json({ info: info ? serialize(info) : { ownerId: req.params.userId, ...EMPTY } });
});

export const updateOwnInfo = asyncHandler(async (req: Request, res: Response) => {
  const info = await emergencyInfoService.upsertOwnInfo(req.userId!, req.body);
  res.json({ info: serialize(info) });
});
