import { Schema, model } from "mongoose";

/** A sector / area added from an app, on top of the built-in ones in shineMediaService. */
const shineSectorSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    tag: { type: String, required: true },
  },
  { timestamps: true }
);

export const ShineSector = model("ShineSector", shineSectorSchema);
