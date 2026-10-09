import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

/** Per lead-sheet SMS settings (the sheet name is the lead's `origin`): the message and the Auto-send switch. */
const schema = new Schema(
  {
    sheet: { type: String, required: true, trim: true, unique: true, maxlength: 120 },
    /** {name} becomes the lead's name. */
    text: { type: String, default: "", trim: true, maxlength: 600 },
    auto: { type: Boolean, default: false },
    /** When set, only leads created at/after this moment are texted (the "only new leads" choice when switching on). */
    onlyNewSince: { type: Date, default: null },
    /** Round-robin between sheets that are switched on. */
    lastServedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type SmsSheetDocument = HydratedDocument<InferSchemaType<typeof schema>>;
export const SmsSheet = model("SmsSheet", schema);
