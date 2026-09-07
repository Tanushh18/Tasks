import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const noteItemSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 500 },
    done: { type: Boolean, default: false },
  },
  { _id: false }
);

const noteSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, default: "", trim: true, maxlength: 200 },
    type: { type: String, enum: ["text", "checklist"], default: "text" },
    body: { type: String, default: "", maxlength: 5000 },
    items: { type: [noteItemSchema], default: [] },
    color: { type: String, default: "default", maxlength: 30 },
    pinned: { type: Boolean, default: false },
    sharedWith: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true }
);

noteSchema.index({ ownerId: 1, pinned: -1, updatedAt: -1 });
noteSchema.index({ sharedWith: 1 });

export type NoteDocument = HydratedDocument<InferSchemaType<typeof noteSchema>>;

export const Note = model("Note", noteSchema);
