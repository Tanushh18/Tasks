import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

const recurrenceSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly", "custom"],
      default: "none",
    },
    interval: { type: Number, default: 1 }, // e.g. every N days/weeks/months for custom
    daysOfWeek: { type: [Number], default: undefined }, // 0-6, for weekly
    endDate: { type: Date, default: null },
  },
  { _id: false }
);

const reminderSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    notifyAt: { type: Date, default: null }, // absolute datetime of the (next) reminder
    alarmEnabled: { type: Boolean, default: false },
    localNotificationId: { type: String, default: null }, // maps to the scheduled expo-notifications id
  },
  { _id: false }
);

const taskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    date: { type: String, required: true }, // YYYY-MM-DD (local calendar date)
    time: { type: String, required: true }, // HH:mm (local time)
    timezone: { type: String, default: "Asia/Kolkata" },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    category: { type: String, default: "General", trim: true, maxlength: 60 },
    completed: { type: Boolean, default: false, index: true },
    completedAt: { type: Date, default: null },
    reminder: { type: reminderSchema, default: () => ({}) },
    recurrence: { type: recurrenceSchema, default: () => ({ type: "none" }) },
    notes: { type: String, default: "", maxlength: 2000 },
    // Client-generated key so a retried "create" from an offline queue can't create a duplicate task.
    // No default: the field must be entirely absent (not null) for docs without one, or the sparse
    // unique index below would treat every such doc as colliding on the same null value.
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

taskSchema.index({ userId: 1, date: 1 });
taskSchema.index({ userId: 1, completed: 1, date: 1 });
taskSchema.index({ userId: 1, title: "text", description: "text", notes: "text" });
// A plain `sparse` index doesn't work here: for a *compound* index, MongoDB only excludes a
// document if it's missing ALL indexed fields, and userId is always present. A partial index with
// an explicit filter is what actually excludes documents that lack idempotencyKey.
taskSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export type TaskDocument = HydratedDocument<InferSchemaType<typeof taskSchema>>;

export const Task = model("Task", taskSchema);
export type TaskId = Types.ObjectId;
