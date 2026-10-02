import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/authService";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

/** Admin by flag, or by being one of the configured admin numbers (checked on every request, not just at sign-up). */
export function isAdminUser(user: { isAdmin?: boolean | null; mobileNumber?: string | null }): boolean {
  const mobile = String(user.mobileNumber ?? "").replace(/\D/g, "").slice(-10);
  return !!user.isAdmin || (!!mobile && env.adminMobileNumbers.some((n) => n.replace(/\D/g, "").slice(-10) === mobile));
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      isAdmin?: boolean;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing bearer token");
    }
    const token = header.slice("Bearer ".length);
    const { userId } = verifyAccessToken(token);

    const user = await User.findById(userId).select("isAdmin blocked mobileNumber");
    if (!user || user.blocked) {
      throw ApiError.forbidden("This account has been blocked");
    }

    req.userId = userId;
    req.isAdmin = isAdminUser(user);
    next();
  })().catch(next);
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    throw ApiError.forbidden("Admin access required");
  }
  next();
}
