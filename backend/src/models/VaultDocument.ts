import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const CATEGORIES = ["insurance", "warranty", "vehicle", "property", "other"] as const;

const vaultDocumentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: CATEGORIES, default: "other" },
    // The app sends the file as a base64 data URL; the service uploads it to Cloudinary and
    // stores the https URL here (the raw data URL is kept only if Cloudinary isn't configured).
    fileData: { type: String, required: true },
    // Set when fileData is a Cloudinary URL (older documents still hold the base64 data URL).
    filePublicId: { type: String, default: null },
    fileResourceType: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    notes: { type: String, default: "", maxlength: 1000 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
  },
  { timestamps: true }
);

export type VaultDocumentDocument = HydratedDocument<InferSchemaType<typeof vaultDocumentSchema>>;
export type VaultDocumentCategory = (typeof CATEGORIES)[number];
export const VAULT_DOCUMENT_CATEGORIES = CATEGORIES;

export const VaultDocument = model("VaultDocument", vaultDocumentSchema);
