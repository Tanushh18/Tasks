import { Schema, model } from "mongoose";

/** The single Shine One SMS settings document (key "shine"). Edited from Stashr's SMS sender. */
const schema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    paused: { type: Boolean, default: false },
    /** Limits are set from Stashr's SMS sender only. null = no limit. */
    dailyLimit: { type: Number, default: null },
    hourlyLimit: { type: Number, default: null },
    gapMinSec: { type: Number, default: null },
    gapMaxSec: { type: Number, default: null },
    lunchStart: { type: String, default: "13:00" },
    lunchEnd: { type: String, default: "14:00" },
    lunchQuota: { type: Number, default: null },
    nightStart: { type: String, default: "21:00" },
    nightEnd: { type: String, default: "23:00" },
    /** 0 = Sunday … 6 = Saturday. */
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  },
  { timestamps: true }
);

export const SmsSettings = model("SmsSettings", schema);
