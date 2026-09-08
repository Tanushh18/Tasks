import type { Request, Response } from "express";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";

export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const { query } = req.query as unknown as { query?: string };

  const users = await User.find({
    // No query means "everyone else" — the family roster, not a search.
    ...(query ? { name: { $regex: query, $options: "i" } } : {}),
    _id: { $ne: req.userId },
    blocked: { $ne: true },
  })
    .limit(20)
    .sort("name")
    .select("name lastLoginAt");

  res.json({
    users: users.map((u) => ({
      id: String(u._id),
      name: u.name,
      lastActiveAt: u.lastLoginAt,
    })),
  });
});
