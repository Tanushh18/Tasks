import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const financeAccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", maxlength: 300 },
    type: {
      type: String,
      enum: ["home", "office", "personal", "travel", "business", "education", "savings", "custom"],
      default: "custom",
    },
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

financeAccountSchema.index({ userId: 1, archived: 1 });
financeAccountSchema.index({ userId: 1, name: 1 }, { unique: true });

export type FinanceAccountDocument = HydratedDocument<InferSchemaType<typeof financeAccountSchema>>;

export const FinanceAccount = model("FinanceAccount", financeAccountSchema);
