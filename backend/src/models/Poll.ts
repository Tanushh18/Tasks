import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const voteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    optionIndex: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const pollSchema = new Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    options: { type: [String], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // One entry per voter; a repeat vote from the same user overwrites their
    // existing entry rather than appending, so counts never double-count.
    votes: { type: [voteSchema], default: [] },
    closesAt: { type: Date, default: null },
    closed: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

pollSchema.index({ createdAt: -1 });

export type PollDocument = HydratedDocument<InferSchemaType<typeof pollSchema>>;

export const Poll = model("Poll", pollSchema);
