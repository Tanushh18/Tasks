import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const messageSchema = new Schema(
  {
    fromUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    toUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ fromUserId: 1, toUserId: 1, createdAt: 1 });
messageSchema.index({ toUserId: 1, fromUserId: 1, createdAt: 1 });

export type MessageDocument = HydratedDocument<InferSchemaType<typeof messageSchema>>;

export const Message = model("Message", messageSchema);
