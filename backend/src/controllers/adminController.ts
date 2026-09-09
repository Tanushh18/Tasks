import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as adminService from "../services/adminService";

function serializeUser(user: {
  _id: unknown;
  name: string;
  mobileNumber: string;
  blocked: boolean;
  isAdmin: boolean;
  createdAt?: Date;
}) {
  return {
    id: String(user._id),
    name: user.name,
    mobileNumber: user.mobileNumber,
    blocked: user.blocked,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await adminService.listUsers(req.userId!);
  res.json({ users: users.map(serializeUser) });
});

export const blockUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminService.blockUser(req.params.id);
  res.json({ user: serializeUser(user) });
});

export const unblockUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminService.unblockUser(req.params.id);
  res.json({ user: serializeUser(user) });
});

export const resetMpin = asyncHandler(async (req: Request, res: Response) => {
  const { mpin, user } = await adminService.resetMpin(req.params.id);
  res.json({ mpin, user: serializeUser(user) });
});

function serializeFlags(flags: {
  contacts: boolean;
  chat: boolean;
  ocr: boolean;
  location: boolean;
  assistant: boolean;
  notes: boolean;
  groupExpenses: boolean;
  documentVault: boolean;
  householdInventory: boolean;
  emergencyInfo: boolean;
  familyEvents: boolean;
  shoppingLists: boolean;
  recurringPayments: boolean;
  familyGoals: boolean;
}) {
  return {
    contacts: flags.contacts,
    chat: flags.chat,
    ocr: flags.ocr,
    location: flags.location,
    assistant: flags.assistant,
    notes: flags.notes,
    groupExpenses: flags.groupExpenses,
    documentVault: flags.documentVault,
    householdInventory: flags.householdInventory,
    emergencyInfo: flags.emergencyInfo,
    familyEvents: flags.familyEvents,
    shoppingLists: flags.shoppingLists,
    recurringPayments: flags.recurringPayments,
    familyGoals: flags.familyGoals,
  };
}

export const getFeatures = asyncHandler(async (_req: Request, res: Response) => {
  const flags = await adminService.getFeatureFlags();
  res.json({ features: serializeFlags(flags) });
});

export const updateFeatures = asyncHandler(async (req: Request, res: Response) => {
  const flags = await adminService.updateFeatureFlags(req.body);
  res.json({ features: serializeFlags(flags) });
});
