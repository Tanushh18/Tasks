import crypto from "node:crypto";
import { User, type UserDocument } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { hashMpin } from "./authService";

export async function listUsers(callerId: string) {
  return User.find({ _id: { $ne: callerId } })
    .select("name mobileNumber blocked isAdmin createdAt")
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
