import type { Request, Response } from "express";
import { globalSearch } from "../services/searchService";
import { asyncHandler } from "../utils/asyncHandler";

export const search = asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query as { q: string };
  const results = await globalSearch(req.userId!, q);
  res.json({ results });
});
