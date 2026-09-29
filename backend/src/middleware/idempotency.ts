import type { NextFunction, Request, Response } from "express";
import { IdempotencyRecord } from "../models/IdempotencyRecord";

const MAX_KEY_LENGTH = 100;

/**
 * Replays the stored response for a POST that repeats an `Idempotency-Key` instead of running the
 * handler a second time. Only successful responses are remembered, so a failed attempt can still
 * be retried for real. Auth routes are excluded: they hand out tokens and are never queued.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.header("Idempotency-Key");
  if (!key || req.method !== "POST" || key.length > MAX_KEY_LENGTH || req.path.startsWith("/auth")) {
    next();
    return;
  }

  void (async () => {
    const existing = await IdempotencyRecord.findOne({ key });
    if (existing && existing.path === req.originalUrl) {
      res.status(existing.status).json(existing.body);
      return;
    }

    const sendJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void IdempotencyRecord.create({
          key,
          path: req.originalUrl,
          status: res.statusCode,
          body,
        }).catch(() => undefined);
      }
      return sendJson(body);
    };
    next();
  })().catch(next);
}
