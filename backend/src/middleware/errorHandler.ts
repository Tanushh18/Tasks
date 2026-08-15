import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Validation failed", details: err.flatten() } });
    return;
  }

  if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === 11000) {
    res.status(409).json({ error: { code: "CONFLICT", message: "A record with these details already exists" } });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: err.message } });
    return;
  }

  logger.error("Unhandled error", { message: err instanceof Error ? err.message : String(err), path: req.path });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}
