import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const locationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number, default: null },
  },
  { timestamps: true }
);

export type LocationDocument = HydratedDocument<InferSchemaType<typeof locationSchema>>;

export const Location = model("Location", locationSchema);
