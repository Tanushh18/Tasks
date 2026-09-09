import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const featureFlagsSchema = new Schema(
  {
    _id: { type: String, default: "global" },
    contacts: { type: Boolean, default: true },
    chat: { type: Boolean, default: true },
    ocr: { type: Boolean, default: true },
    location: { type: Boolean, default: true },
    assistant: { type: Boolean, default: true },
    notes: { type: Boolean, default: true },
    groupExpenses: { type: Boolean, default: true },
    recurringPayments: { type: Boolean, default: true },
    familyGoals: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type FeatureFlagsDocument = HydratedDocument<InferSchemaType<typeof featureFlagsSchema>>;

export const FeatureFlags = model("FeatureFlags", featureFlagsSchema);

export async function getFlags(): Promise<FeatureFlagsDocument> {
  const flags = await FeatureFlags.findByIdAndUpdate(
    "global",
    {},
    { upsert: true, setDefaultsOnInsert: true, new: true }
  );
  return flags as FeatureFlagsDocument;
}
