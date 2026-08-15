import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";
import { User, type UserDocument } from "../models/User";
import { ApiError } from "../utils/ApiError";

const MPIN_SALT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const WEAK_MPINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "0123", "123456", "000000"]);

export function assertValidMpin(mpin: string): void {
  if (!/^\d{4,6}$/.test(mpin)) {
    throw ApiError.badRequest("MPIN must be 4 to 6 digits");
  }
  if (WEAK_MPINS.has(mpin)) {
    throw ApiError.badRequest("This MPIN is too easy to guess. Please choose a different one.");
  }
}

export function assertValidMobileNumber(mobileNumber: string): void {
  if (!/^\+?[1-9]\d{9,14}$/.test(mobileNumber)) {
    throw ApiError.badRequest("Enter a valid mobile number");
  }
}

export async function hashMpin(mpin: string): Promise<string> {
  return bcrypt.hash(mpin, MPIN_SALT_ROUNDS);
}

export async function verifyMpin(mpin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(mpin, hash);
}

function signToken(userId: string, secret: string, expiresIn: string, extra: Record<string, unknown> = {}) {
  const options: SignOptions = { expiresIn: expiresIn as SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, ...extra }, secret, options);
}

export function signAccessToken(userId: string): string {
  return signToken(userId, env.jwtAccessSecret, env.jwtAccessExpiresIn);
}

export function signRefreshToken(userId: string): string {
  return signToken(userId, env.jwtRefreshSecret, env.jwtRefreshExpiresIn, {
    jti: crypto.randomUUID(),
  });
}

export function verifyAccessToken(token: string): { userId: string } {
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret) as jwt.JwtPayload;
    if (!payload.sub) throw new Error("missing sub");
    return { userId: payload.sub };
  } catch {
    throw ApiError.unauthorized("Invalid or expired session");
  }
}

export function verifyRefreshToken(token: string): { userId: string } {
  try {
    const payload = jwt.verify(token, env.jwtRefreshSecret) as jwt.JwtPayload;
    if (!payload.sub) throw new Error("missing sub");
    return { userId: payload.sub };
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }
}

export async function issueTokenPair(userId: string) {
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);
  const refreshTokenHash = await bcrypt.hash(refreshToken, MPIN_SALT_ROUNDS);
  await User.findByIdAndUpdate(userId, { refreshTokenHash });
  return { accessToken, refreshToken };
}

export async function revokeRefreshToken(userId: string) {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
}

export function isLocked(user: UserDocument): boolean {
  return Boolean(user.lockUntil && user.lockUntil.getTime() > Date.now());
}

export async function registerFailedAttempt(user: UserDocument): Promise<void> {
  user.failedLoginAttempts += 1;
  if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    user.failedLoginAttempts = 0;
  }
  await user.save();
}

export async function clearFailedAttempts(user: UserDocument): Promise<void> {
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }
}

export function remainingLockSeconds(user: UserDocument): number {
  if (!user.lockUntil) return 0;
  return Math.max(0, Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000));
}
