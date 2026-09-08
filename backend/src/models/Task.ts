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

const checklistItemSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
    done: { type: Boolean, default: false },
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
    // Four levels rather than three: "normal" is the unremarkable default, and
    // separating "important" from "urgent" is the distinction families actually
    // make (this matters vs. this matters *now*). Tasks written under the older
    // low/medium/high scale are migrated by `migrateTaskPriorities` on startup.
    priority: { type: String, enum: ["low", "normal", "important", "urgent"], default: "normal" },
    category: { type: String, default: "General", trim: true, maxlength: 60 },
    checklist: { type: [checklistItemSchema], default: [] },
    completed: { type: Boolean, default: false, index: true },
    completedAt: { type: Date, default: null },
    reminder: { type: reminderSchema, default: () => ({}) },
    recurrence: { type: recurrenceSchema, default: () => ({ type: "none" }) },
    notes: { type: String, default: "", maxlength: 2000 },
    // Client-generated key so a retried "create" from an offline queue can't create a duplicate task.
    // No default: the field must be entirely absent (not null) for docs without one, or the sparse
    // unique index below would treat every such doc as colliding on the same null value.
    idempotencyKey: { type: String },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Who is expected to do this. `userId` stays the owner (whose list it lives
    // in); `assignedTo` is who it's for, which in a family is often someone else.
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
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

/**
 * Moves tasks off the old three-level priority scale.
 *
 * Run once at startup. `medium` was the old default so it becomes `normal`;
 * `high` becomes `important` rather than `urgent` — quietly escalating every
 * previously-high task to the app's loudest level would be a worse guess than
 * under-stating it, and the user can raise the few that really are urgent.
 *
 * Safe to run repeatedly: once no documents match, it does nothing.
 */
export async function migrateTaskPriorities(): Promise<number> {
  const [medium, high] = await Promise.all([
    Task.updateMany({ priority: "medium" }, { $set: { priority: "normal" } }),
    Task.updateMany({ priority: "high" }, { $set: { priority: "important" } }),
  ]);
  return medium.modifiedCount + high.modifiedCount;
}
