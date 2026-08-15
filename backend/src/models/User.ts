import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const userSchema = new Schema(
  {
    mobileNumber: { type: String, required: true, unique: true, index: true, trim: true },
    mpinHash: { type: String, required: true },
    refreshTokenHash: { type: String, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    notificationsEnabled: { type: Boolean, default: true },
    confirmFinancialActions: { type: Boolean, default: true },
    speakAssistantReplies: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model("User", userSchema);
