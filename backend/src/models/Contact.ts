import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const contactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    number: { type: String, required: true, trim: true, maxlength: 30 },
    description: { type: String, default: "", maxlength: 500 },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sharedWith: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true }
);

contactSchema.index({ addedBy: 1 });
contactSchema.index({ sharedWith: 1 });

export type ContactDocument = HydratedDocument<InferSchemaType<typeof contactSchema>>;

export const Contact = model("Contact", contactSchema);
