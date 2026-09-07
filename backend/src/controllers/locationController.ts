import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as locationService from "../services/locationService";

export const ping = asyncHandler(async (req: Request, res: Response) => {
  await locationService.upsertLocation(req.userId!, req.body);
  res.status(204).send();
});

export const getShares = asyncHandler(async (req: Request, res: Response) => {
  const shares = await locationService.listShares(req.userId!);
  res.json(shares);
});

export const startSharing = asyncHandler(async (req: Request, res: Response) => {
  const { toUserId } = req.body as { toUserId: string };
  await locationService.startSharing(req.userId!, toUserId);
  res.status(204).send();
});

export const stopSharing = asyncHandler(async (req: Request, res: Response) => {
  const { toUserId } = req.params as { toUserId: string };
  await locationService.stopSharing(req.userId!, toUserId);
  res.status(204).send();
});
