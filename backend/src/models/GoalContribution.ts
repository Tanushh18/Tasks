import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const goalContributionSchema = new Schema(
  {
    goalId: { type: Schema.Types.ObjectId, ref: "FamilyGoal", required: true, index: true },
    contributedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: String, required: true }, // YYYY-MM-DD
    note: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true }
);

goalContributionSchema.index({ goalId: 1, date: -1 });

export type GoalContributionDocument = HydratedDocument<InferSchemaType<typeof goalContributionSchema>>;

export const GoalContribution = model("GoalContribution", goalContributionSchema);
