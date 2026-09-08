import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/** Records an actual payment one member made to another to settle up a debt. */
const groupSettlementSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ExpenseGroup", required: true, index: true },
    fromUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: String, required: true }, // YYYY-MM-DD
    note: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true }
);

groupSettlementSchema.index({ groupId: 1, date: -1 });

export type GroupSettlementDocument = HydratedDocument<InferSchemaType<typeof groupSettlementSchema>>;

export const GroupSettlement = model("GroupSettlement", groupSettlementSchema);
