import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const locationShareSchema = new Schema(
  {
    fromUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // null means shared continuously (no expiry). Expired shares are filtered out on read.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

locationShareSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
locationShareSchema.index({ toUserId: 1 });

export type LocationShareDocument = HydratedDocument<InferSchemaType<typeof locationShareSchema>>;

export const LocationShare = model("LocationShare", locationShareSchema);
