import { Schema, model } from "mongoose";

/** One message handed to a phone. Also the record the daily/hourly limits are counted from. Deleted after 60 days. */
const schema = new Schema(
  {
    kind: { type: String, enum: ["lead", "test"], default: "lead" },
    leadId: { type: Schema.Types.ObjectId, default: null, index: true },
    phone: { type: String, required: true },
    /** The text is kept only until it is sent, so a log never holds a customer's message. */
    message: { type: String, default: "" },
    sheet: { type: String, default: "" },
    deviceId: { type: String, default: "", index: true },
    deviceName: { type: String, default: "" },
    window: { type: String, enum: ["lunch", "night", "any"], default: "any" },
    dayKey: { type: String, default: "", index: true },
    status: { type: String, enum: ["pending", "sending", "sent", "failed"], default: "sending", index: true },
    delivery: { type: String, default: "" },
    error: { type: String, default: "" },
    claimedAt: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);
schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });
schema.index({ deviceId: 1, claimedAt: -1 });

export const SmsSend = model("SmsSend", schema);
