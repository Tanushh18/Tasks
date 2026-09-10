import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as activityFeedService from "../services/activityFeedService";

export const getActivityFeed = asyncHandler(async (_req: Request, res: Response) => {
  const entries = await activityFeedService.getActivityFeed();
  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      actorName: e.actorName,
      text: e.text,
      amount: e.amount ?? null,
      at: e.at,
    })),
  });
});
