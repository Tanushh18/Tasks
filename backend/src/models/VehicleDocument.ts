import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const VEHICLE_DOCUMENT_TYPES = ["pollution", "insurance", "registration", "service", "warranty", "other"] as const;

const vehicleDocumentSchema = new Schema(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    type: { type: String, enum: VEHICLE_DOCUMENT_TYPES, default: "other" },
    customLabel: { type: String, trim: true, maxlength: 60 },
    expiresAt: { type: Date, default: null },
    reminderEnabled: { type: Boolean, default: true },
    // Documents are photographed/scanned client-side and stored as a base64 data URL,
    // matching how ocrService already handles images in this app (no multer/disk
    // storage exists yet) — a small JSON+base64 payload rather than a new file pipeline.
    // Unlike VaultDocument, a vehicle document entry can exist with just an expiry date
    // and no attached file, so this is optional.
    fileData: { type: String },
    fileName: { type: String },
    notes: { type: String, default: "", maxlength: 1000 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

export type VehicleDocumentDocument = HydratedDocument<InferSchemaType<typeof vehicleDocumentSchema>>;
export type VehicleDocumentType = (typeof VEHICLE_DOCUMENT_TYPES)[number];
export const VEHICLE_DOCUMENT_TYPES_LIST = VEHICLE_DOCUMENT_TYPES;

export const VehicleDocument = model("VehicleDocument", vehicleDocumentSchema);
