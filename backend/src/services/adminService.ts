import crypto from "node:crypto";
import { User, type UserDocument } from "../models/User";
import { getFlags, FeatureFlags, type FeatureFlagsDocument } from "../models/FeatureFlags";
import { ApiError } from "../utils/ApiError";
import { hashMpin } from "./authService";

interface FeatureFlagsPatch {
  contacts?: boolean;
  chat?: boolean;
  ocr?: boolean;
  location?: boolean;
  assistant?: boolean;
  notes?: boolean;
  groupExpenses?: boolean;
}

export async function getFeatureFlags(): Promise<FeatureFlagsDocument> {
  return getFlags();
}

export async function updateFeatureFlags(patch: FeatureFlagsPatch): Promise<FeatureFlagsDocument> {
  await getFlags();
  const flags = await FeatureFlags.findByIdAndUpdate("global", patch, { new: true });
  return flags as FeatureFlagsDocument;
}

export async function listUsers(callerId: string) {
  return User.find({ _id: { $ne: callerId } })
    .select("name mobileNumber blocked isAdmin createdAt lastLoginAt")
    .sort("-createdAt");
}

async function getUserOrThrow(id: string): Promise<UserDocument> {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function blockUser(id: string): Promise<UserDocument> {
  const user = await getUserOrThrow(id);
  user.blocked = true;
  await user.save();
  return user;
}

export async function unblockUser(id: string): Promise<UserDocument> {
  const user = await getUserOrThrow(id);
  user.blocked = false;
  await user.save();
  return user;
}

export async function resetMpin(id: string): Promise<{ mpin: string; user: UserDocument }> {
  const user = await getUserOrThrow(id);
  const mpin = String(crypto.randomInt(100000, 999999));
  user.mpinHash = await hashMpin(mpin);
  user.mustChangeMpin = true;
  await user.save();
  return { mpin, user };
}
