import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const CATEGORIES = ["insurance", "warranty", "vehicle", "property", "other"] as const;

const vaultDocumentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: CATEGORIES, default: "other" },
    // Documents are photographed/scanned client-side and stored as a base64 data URL,
    // matching how ocrService already handles images in this app (no multer/disk
    // storage exists yet) — a small JSON+base64 payload rather than a new file pipeline.
    fileData: { type: String, required: true },
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
