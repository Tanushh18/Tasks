import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const paymentEntrySchema = new Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD, the date it was marked paid
    amount: { type: Number, required: true, min: 0 },
    paid: { type: Boolean, default: true },
  },
  { _id: false }
);

const recurringPaymentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, default: "General", trim: true, maxlength: 60 },
    frequency: { type: String, enum: ["weekly", "monthly", "yearly"], required: true },
    // Plain date string that we advance to the next period each time the bill
    // is marked paid, rather than deriving due dates from a day-of-month rule
    // (simpler, and handles month-length edge cases without extra logic).
    nextDueDate: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "FinanceAccount", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    active: { type: Boolean, default: true },
    history: { type: [paymentEntrySchema], default: [] },
  },
  { timestamps: true }
);

recurringPaymentSchema.index({ createdBy: 1, active: 1 });

export type RecurringPaymentDocument = HydratedDocument<InferSchemaType<typeof recurringPaymentSchema>>;

export const RecurringPayment = model("RecurringPayment", recurringPaymentSchema);
