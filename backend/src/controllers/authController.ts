import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { Task } from "../models/Task";
import { FinanceAccount } from "../models/FinanceAccount";
import { Transaction } from "../models/Transaction";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import {
  assertValidMpin,
  assertValidMobileNumber,
  clearFailedAttempts,
  hashMpin,
  isLocked,
  issueTokenPair,
  registerFailedAttempt,
  remainingLockSeconds,
  revokeRefreshToken,
  verifyMpin,
  verifyRefreshToken,
} from "../services/authService";

function toPublicUser(user: {
  _id: unknown;
  mobileNumber: string;
  currency: string;
  timezone: string;
  notificationsEnabled: boolean;
  confirmFinancialActions: boolean;
  speakAssistantReplies: boolean;
  createdAt?: Date;
}) {
  return {
    id: String(user._id),
    mobileNumber: user.mobileNumber,
    currency: user.currency,
    timezone: user.timezone,
    notificationsEnabled: user.notificationsEnabled,
    confirmFinancialActions: user.confirmFinancialActions,
    speakAssistantReplies: user.speakAssistantReplies,
    createdAt: user.createdAt,
  };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, mpin } = req.body as { mobileNumber: string; mpin: string };

  assertValidMobileNumber(mobileNumber);
  assertValidMpin(mpin);

  const existing = await User.findOne({ mobileNumber });
  if (existing) {
    throw ApiError.conflict("An account with this mobile number already exists");
  }

  const mpinHash = await hashMpin(mpin);
  const user = await User.create({ mobileNumber, mpinHash, lastLoginAt: new Date() });
  const tokens = await issueTokenPair(String(user._id));

  res.status(201).json({ user: toPublicUser(user), ...tokens });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, mpin } = req.body as { mobileNumber: string; mpin: string };

  const user = await User.findOne({ mobileNumber });
  if (!user) {
    throw ApiError.unauthorized("Invalid mobile number or MPIN");
  }

  if (isLocked(user)) {
    throw ApiError.tooManyRequests(
      `Too many failed attempts. Try again in ${remainingLockSeconds(user)} seconds.`
    );
  }

  const valid = await verifyMpin(mpin, user.mpinHash);
  if (!valid) {
    await registerFailedAttempt(user);
    throw ApiError.unauthorized("Invalid mobile number or MPIN");
  }

  await clearFailedAttempts(user);
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(String(user._id));
  res.json({ user: toPublicUser(user), ...tokens });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const { userId } = verifyRefreshToken(refreshToken);

  const user = await User.findById(userId);
  if (!user?.refreshTokenHash) {
    throw ApiError.unauthorized("Session expired, please log in again");
  }

  const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!matches) {
    throw ApiError.unauthorized("Session expired, please log in again");
  }

  const tokens = await issueTokenPair(String(user._id));
  res.json(tokens);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.userId) {
    await revokeRefreshToken(req.userId);
  }
  res.status(204).send();
});

export const changeMpin = asyncHandler(async (req: Request, res: Response) => {
  const { currentMpin, newMpin } = req.body as { currentMpin: string; newMpin: string };
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.notFound("User not found");

  const valid = await verifyMpin(currentMpin, user.mpinHash);
  if (!valid) throw ApiError.unauthorized("Current MPIN is incorrect");

  assertValidMpin(newMpin);
  user.mpinHash = await hashMpin(newMpin);
  await user.save();
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.notFound("User not found");
  res.json({ user: toPublicUser(user) });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const { currency, timezone, notificationsEnabled, confirmFinancialActions, speakAssistantReplies } = req.body as {
    currency?: string;
    timezone?: string;
    notificationsEnabled?: boolean;
    confirmFinancialActions?: boolean;
    speakAssistantReplies?: boolean;
  };
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.notFound("User not found");

  if (currency !== undefined) user.currency = currency;
  if (timezone !== undefined) user.timezone = timezone;
  if (notificationsEnabled !== undefined) user.notificationsEnabled = notificationsEnabled;
  if (confirmFinancialActions !== undefined) user.confirmFinancialActions = confirmFinancialActions;
  if (speakAssistantReplies !== undefined) user.speakAssistantReplies = speakAssistantReplies;
  await user.save();

  res.json({ user: toPublicUser(user) });
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  await Promise.all([
    User.findByIdAndDelete(userId),
    Task.deleteMany({ userId }),
    FinanceAccount.deleteMany({ userId }),
    Transaction.deleteMany({ userId }),
  ]);
  res.status(204).send();
});
