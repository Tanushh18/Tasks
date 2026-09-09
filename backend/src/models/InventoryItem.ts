import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const CATEGORIES = ["appliance", "electronics", "furniture", "vehicle", "other"] as const;

const inventoryItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: CATEGORIES, default: "other" },
    purchaseDate: { type: String, default: null }, // YYYY-MM-DD, kept as a string like other date fields in this app
    price: { type: Number, default: null },
    warrantyExpiresAt: { type: Date, default: null, index: true },
    serialNumber: { type: String, default: "", maxlength: 120 },
    notes: { type: String, default: "", maxlength: 1000 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
  },
  { timestamps: true }
);

export type InventoryItemDocument = HydratedDocument<InferSchemaType<typeof inventoryItemSchema>>;
export type InventoryItemCategory = (typeof CATEGORIES)[number];
export const INVENTORY_ITEM_CATEGORIES = CATEGORIES;

export const InventoryItem = model("InventoryItem", inventoryItemSchema);
