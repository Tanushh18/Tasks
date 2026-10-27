import { Schema, model } from "mongoose";

/** One shared document: the ordered backend URLs the apps use. Stored in the database, so every server serves the same list. */
const serverListSchema = new Schema(
  {
    _id: { type: String, default: "global" },
    urls: { type: [String], default: [] },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export const ServerList = model("ServerList", serverListSchema);
