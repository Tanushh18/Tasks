import { Schema, model } from "mongoose";

/**
 * Remembers the response to a write that carried an `Idempotency-Key`, so the mobile app can
 * safely replay a create after a timeout or an offline queue flush without it landing twice.
 * Records expire after a day — long enough for any realistic retry, short enough to stay small.
 */
const idempotencyRecordSchema = new Schema({
  key: { type: String, required: true, unique: true },
  path: { type: String, required: true },
  status: { type: Number, required: true },
  body: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

export const IdempotencyRecord = model("IdempotencyRecord", idempotencyRecordSchema);
