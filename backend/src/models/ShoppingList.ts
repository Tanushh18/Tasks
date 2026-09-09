import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const shoppingItemSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
    checked: { type: Boolean, default: false },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const shoppingListSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    // Embedded rather than a separate collection — items always load with
    // their list and never need independent pagination, mirroring how
    // GroupExpense.splits is embedded rather than its own collection.
    items: { type: [shoppingItemSchema], default: [] },
  },
  { timestamps: true }
);

export type ShoppingListDocument = HydratedDocument<InferSchemaType<typeof shoppingListSchema>>;

export const ShoppingList = model("ShoppingList", shoppingListSchema);
