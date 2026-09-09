import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const emergencyContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    relation: { type: String, default: "", maxlength: 60 },
  },
  { _id: false }
);

const emergencyInfoSchema = new Schema(
  {
    // One record per user (upsert pattern) rather than a list — every user
    // maintains exactly one emergency-info sheet, so ownerId is unique.
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    emergencyContacts: { type: [emergencyContactSchema], default: [] },
    medicalNotes: { type: String, default: "", maxlength: 2000 },
    homeInfo: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

export type EmergencyInfoDocument = HydratedDocument<InferSchemaType<typeof emergencyInfoSchema>>;

export const EmergencyInfo = model("EmergencyInfo", emergencyInfoSchema);
