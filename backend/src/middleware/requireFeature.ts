import type { NextFunction, Request, Response } from "express";
import { getFlags } from "../models/FeatureFlags";
import { ApiError } from "../utils/ApiError";

type FeatureName =
  | "contacts"
  | "chat"
  | "ocr"
  | "location"
  | "assistant"
  | "notes"
  | "groupExpenses"
  | "documentVault"
  | "householdInventory"
  | "emergencyInfo"
  | "familyEvents"
  | "shoppingLists"
  | "recurringPayments"
  | "familyGoals";

export function requireFeature(name: FeatureName) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      const flags = await getFlags();
      if (!flags[name]) {
        throw ApiError.forbidden("This feature is currently turned off");
      }
      next();
    })().catch(next);
  };
}
