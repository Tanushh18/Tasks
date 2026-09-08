import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const splitSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const groupExpenseSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ExpenseGroup", required: true, index: true },
    paidBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    description: { type: String, default: "", maxlength: 300 },
    category: { type: String, default: "General", trim: true, maxlength: 60 },
    date: { type: String, required: true }, // YYYY-MM-DD
    // Who owes what share of this expense. Always stored explicitly (even for
    // an equal split) so balance math never has to re-derive it from group
    // membership at read time — membership can change after the expense was logged.
    splits: { type: [splitSchema], required: true },
  },
  { timestamps: true }
);

groupExpenseSchema.index({ groupId: 1, date: -1 });

export type GroupExpenseDocument = HydratedDocument<InferSchemaType<typeof groupExpenseSchema>>;

export const GroupExpense = model("GroupExpense", groupExpenseSchema);
