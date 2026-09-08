import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const expenseGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Always includes createdBy — kept as an explicit member so the creator
    // shows up in balances/splits like everyone else, not as a special case.
    members: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type ExpenseGroupDocument = HydratedDocument<InferSchemaType<typeof expenseGroupSchema>>;

export const ExpenseGroup = model("ExpenseGroup", expenseGroupSchema);
