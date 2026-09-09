import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const familyGoalSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    targetAmount: { type: Number, required: true, min: 0.01 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    deadline: { type: String, default: null }, // YYYY-MM-DD, optional
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type FamilyGoalDocument = HydratedDocument<InferSchemaType<typeof familyGoalSchema>>;

export const FamilyGoal = model("FamilyGoal", familyGoalSchema);
