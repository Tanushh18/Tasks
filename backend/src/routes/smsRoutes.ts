import { Router, type NextFunction, type Request, type Response } from "express";
import { env } from "../config/env";
import * as sms from "../services/smsService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

/** Phones (the SMS Service Android app): "Authorization: Bearer <SMS_DEVICE_KEY>" plus an X-Device-Id header. */
export const smsGatewayRouter = Router();

function requireDeviceKey(req: Request, _res: Response, next: NextFunction) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!sms.verifyKey(token, env.smsDeviceKey)) return next(ApiError.unauthorized("Bad device key"));
  next();
}
smsGatewayRouter.use(requireDeviceKey);

const deviceId = (req: Request) => String(req.headers["x-device-id"] || "").slice(0, 64);
const hello = (req: Request): sms.DeviceHello => ({
  deviceId: deviceId(req),
  name: String(req.headers["x-device-name"] || ""),
  ready: req.headers["x-device-ready"] !== "0",
  appVersion: String(req.headers["x-app-version"] || ""),
});

smsGatewayRouter.get(
  "/next",
  asyncHandler(async (req, res) => {
    if (!deviceId(req)) throw ApiError.badRequest("X-Device-Id header required");
    const msg = await sms.claimNext(hello(req));
    if (!msg) {
      res.status(204).end();
      return;
    }
    res.json(msg);
  })
);

/** Read-only status for the app's screen. */
smsGatewayRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    if (!deviceId(req)) throw ApiError.badRequest("X-Device-Id header required");
    await sms.touchDevice(hello(req));
    res.json(await sms.statusForDevice(deviceId(req)));
  })
);

smsGatewayRouter.post(
  "/:id/result",
  asyncHandler(async (req, res) => {
    const { status, error } = req.body ?? {};
    if (!["sent", "failed"].includes(status)) throw ApiError.badRequest("Invalid status");
    await sms.reportResult(req.params.id, deviceId(req), status, error);
    res.json({ ok: true });
  })
);

smsGatewayRouter.post(
  "/:id/delivery",
  asyncHandler(async (req, res) => {
    const { status } = req.body ?? {};
    if (!["delivered", "undelivered"].includes(status)) throw ApiError.badRequest("Invalid status");
    await sms.reportDelivery(req.params.id, status);
    res.json({ ok: true });
  })
);

/**
 * The SMS console (the hidden page on the ggnHome website). The ggnHome server calls this with X-Console-Key, so the
 * key never reaches a browser. Wrong keys are slowed down: 10 misses from one address lock it out for 15 minutes.
 */
export const smsConsoleRouter = Router();
const misses = new Map<string, { n: number; until: number }>();

smsConsoleRouter.use((req, _res, next) => {
  const ip = req.ip || "unknown";
  const m = misses.get(ip);
  if (m && m.until > Date.now() && m.n >= 10) return next(ApiError.tooManyRequests("Too many wrong keys. Try again later."));
  if (!sms.verifyKey(req.headers["x-console-key"], env.smsConsoleKey)) {
    const cur = m && m.until > Date.now() ? m : { n: 0, until: Date.now() + 15 * 60 * 1000 };
    cur.n += 1;
    misses.set(ip, cur);
    return next(ApiError.unauthorized("Bad console key"));
  }
  misses.delete(ip);
  next();
});

smsConsoleRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [sheets, devices, settings] = await Promise.all([sms.sheetOverview(), sms.deviceList(), sms.getStoredSettings()]);
    res.json({
      settings: { ...settings.toObject(), effective: sms.effective(settings), hardCaps: sms.HARD_CAPS },
      sheets,
      ...devices,
    });
  })
);

smsConsoleRouter.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const doc = await sms.updateSettings(req.body ?? {});
    res.json({ settings: { ...doc.toObject(), effective: sms.effective(doc), hardCaps: sms.HARD_CAPS } });
  })
);

smsConsoleRouter.put(
  "/sheets",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const doc = await sms.saveSheet(b.sheet, { text: typeof b.text === "string" ? b.text : undefined, auto: typeof b.auto === "boolean" ? b.auto : undefined, onlyNew: !!b.onlyNew });
    res.json({ sheet: { sheet: doc.sheet, text: doc.text, auto: doc.auto, onlyNewSince: doc.onlyNewSince } });
  })
);

smsConsoleRouter.patch(
  "/devices/:deviceId",
  asyncHandler(async (req, res) => {
    await sms.updateDevice(req.params.deviceId, req.body ?? {});
    res.json({ ok: true });
  })
);

smsConsoleRouter.delete(
  "/devices/:deviceId",
  asyncHandler(async (req, res) => {
    const { SmsDevice } = await import("../models/SmsDevice");
    await SmsDevice.deleteOne({ deviceId: req.params.deviceId });
    res.json({ ok: true });
  })
);

smsConsoleRouter.get(
  "/log",
  asyncHandler(async (req, res) => {
    res.json({ rows: await sms.recentLog(Number(req.query.limit) || 100) });
  })
);

smsConsoleRouter.post(
  "/test",
  asyncHandler(async (req, res) => {
    const id = await sms.queueTest(String(req.body?.phoneNumber ?? ""), String(req.body?.message ?? ""));
    res.json({ ok: true, id });
  })
);
