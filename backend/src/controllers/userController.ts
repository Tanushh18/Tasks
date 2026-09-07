import type { Request, Response } from "express";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";

export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const { query } = req.query as unknown as { query: string };
  const users = await User.find({
    name: { $regex: query, $options: "i" },
    _id: { $ne: req.userId },
  })
    .limit(20)
    .select("name");

  res.json({ users: users.map((u) => ({ id: String(u._id), name: u.name })) });
});
