import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    mobileNumber: { type: String, required: true, unique: true, index: true, trim: true },
    mpinHash: { type: String, required: true },
    // Legacy single bcrypt hash — still honoured so sessions issued before multi-device support
    // keep working until they rotate onto a long-lived token.
    refreshTokenHash: { type: String, default: null },
    // sha256 fingerprints of every live refresh token (one per signed-in device, newest last).
    refreshTokenFingerprints: { type: [String], default: [] },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    notificationsEnabled: { type: Boolean, default: true },
    confirmFinancialActions: { type: Boolean, default: true },
    speakAssistantReplies: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
    mustChangeMpin: { type: Boolean, default: false },
    // Opt-in per the brief: the weekly summary is a computed on-demand aggregation,
    // not something surfaced unless the user has explicitly turned it on.
    weeklySummaryEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model("User", userSchema);
