import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

/**
 * A WhatsApp message (text + one fixed image) attached to the lead sheets (origins) it applies to. Shared by every
 * signed-in user, like leads. A sheet uses at most one template: the service moves a sheet off any other template
 * when it is attached here.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    /** https Cloudinary URL, or a data URL when Cloudinary isn't configured. */
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: null },
    imageResourceType: { type: String, default: null },
    sheets: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export type WhatsAppTemplateDocument = HydratedDocument<InferSchemaType<typeof schema>>;
export const WhatsAppTemplate = model("WhatsAppTemplate", schema);
