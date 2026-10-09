import { Schema, model } from "mongoose";

/** One document per phone running the SMS Service app. `role` says which service(s) it sends for. */
const schema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    name: { type: String, default: "Android phone" },
    role: { type: String, enum: ["shine", "ggnhome", "both"], default: "both" },
    enabled: { type: Boolean, default: true },
    ready: { type: Boolean, default: true },
    appVersion: { type: String, default: "" },
    lastSeen: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
    /** The next time this phone may be given a message (random gap after each one). */
    nextAllowedAt: { type: Date, default: null },
    sentTotal: { type: Number, default: 0 },
    failedTotal: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

export const SmsDevice = model("SmsDevice", schema);
