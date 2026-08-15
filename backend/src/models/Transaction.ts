import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "FinanceAccount", required: true, index: true },
    type: { type: String, enum: ["IN", "OUT"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, default: "General", trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 300 },
    date: { type: String, required: true }, // YYYY-MM-DD
    time: { type: String, required: true }, // HH:mm
    notes: { type: String, default: "", maxlength: 2000 },
    // Client-generated key so a retried "create" from an offline queue can't create a duplicate transaction.
    // No default: the field must be entirely absent (not null) for docs without one, or the sparse
    // unique index below would treat every such doc as colliding on the same null value.
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, accountId: 1, date: -1 });
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });
// A plain `sparse` index doesn't work here: for a *compound* index, MongoDB only excludes a
// document if it's missing ALL indexed fields, and userId is always present. A partial index with
// an explicit filter is what actually excludes documents that lack idempotencyKey.
transactionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export type TransactionDocument = HydratedDocument<InferSchemaType<typeof transactionSchema>>;

export const Transaction = model("Transaction", transactionSchema);
