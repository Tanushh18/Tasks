import { Schema, model } from "mongoose";

/**
 * A name leads can be filed under ("Meta Sheet", "Calling Data", "Referrals"…), created from the app so it exists
 * before its first lead does. Leads store the name in `origin`; this only remembers the names. `key` is the
 * lower-cased name, so "referrals" and "Referrals" are one list.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const LeadList = model("LeadList", schema);
