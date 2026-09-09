import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const familyEventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      enum: ["birthday", "anniversary", "appointment", "trip", "dinner", "custom"],
      default: "custom",
    },
    date: { type: String, required: true }, // YYYY-MM-DD
    time: { type: String, default: null }, // HH:mm, optional
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Always includes createdBy — kept explicit so the creator shows up in the
    // attendee list like everyone else, mirroring ExpenseGroup.members.
    attendees: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    reminderEnabled: { type: Boolean, default: true },
    notes: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

familyEventSchema.index({ date: 1 });

export type FamilyEventDocument = HydratedDocument<InferSchemaType<typeof familyEventSchema>>;

export const FamilyEvent = model("FamilyEvent", familyEventSchema);
