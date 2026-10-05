import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

/**
 * A plain shared document (ID cards, PDFs...) listed for every signed-in user: no vault, no lock. It is either an
 * uploaded file (stored on Cloudinary) or a link such as a Google Drive share URL.
 */
const schema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: ["file", "link"], required: true },
    /** https URL of the file or link; a data URL only when Cloudinary isn't configured. */
    url: { type: String, required: true },
    publicId: { type: String, default: null },
    resourceType: { type: String, default: null },
    fileName: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export type SharedDocumentDocument = HydratedDocument<InferSchemaType<typeof schema>>;
export const SharedDocument = model("SharedDocument", schema);
