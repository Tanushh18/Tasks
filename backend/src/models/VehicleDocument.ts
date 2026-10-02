import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const VEHICLE_DOCUMENT_TYPES = ["pollution", "insurance", "registration", "service", "warranty", "other"] as const;

const vehicleDocumentSchema = new Schema(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    type: { type: String, enum: VEHICLE_DOCUMENT_TYPES, default: "other" },
    customLabel: { type: String, trim: true, maxlength: 60 },
    expiresAt: { type: Date, default: null },
    reminderEnabled: { type: Boolean, default: true },
    // The app sends the file as a base64 data URL; the service uploads it to Cloudinary and
    // stores the https URL here (the raw data URL is kept only if Cloudinary isn't configured).
    // Unlike VaultDocument, a vehicle document entry can exist with just an expiry date
    // and no attached file, so this is optional.
    fileData: { type: String },
    filePublicId: { type: String, default: null },
    fileResourceType: { type: String, default: null },
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
