import { Schema, model } from "mongoose";

/**
 * Remembers numbers the 30-day cleanup deleted, so a sheet sync doesn't bring the same
 * "not interested" lead straight back. Expires after a year.
 */
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  phone: { type: String, required: true },
  deletedAt: { type: Date, default: () => new Date(), expires: 60 * 60 * 24 * 365 },
});
schema.index({ ownerId: 1, phone: 1 }, { unique: true });

export const LeadTombstone = model("LeadTombstone", schema);
