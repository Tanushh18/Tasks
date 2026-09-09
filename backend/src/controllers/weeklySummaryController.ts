import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as weeklySummaryService from "../services/weeklySummaryService";

export const getWeeklySummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await weeklySummaryService.getWeeklySummary(req.userId!);
  res.json(summary);
});
