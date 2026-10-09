import { Schema, model } from "mongoose";

/** The single Shine One SMS settings document (key "shine"). Edited from the SMS console. */
const schema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    /** auto = built-in safe defaults; custom = the values below (always clamped to the hard caps). */
    mode: { type: String, enum: ["auto", "custom"], default: "auto" },
    paused: { type: Boolean, default: false },
    dailyLimit: { type: Number, default: 90 },
    hourlyLimit: { type: Number, default: 30 },
    gapMinSec: { type: Number, default: 8 },
    gapMaxSec: { type: Number, default: 14 },
    lunchStart: { type: String, default: "13:00" },
    lunchEnd: { type: String, default: "14:00" },
    lunchQuota: { type: Number, default: 30 },
    nightStart: { type: String, default: "21:00" },
    nightEnd: { type: String, default: "23:00" },
    /** 0 = Sunday … 6 = Saturday. */
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  },
  { timestamps: true }
);

export const SmsSettings = model("SmsSettings", schema);
