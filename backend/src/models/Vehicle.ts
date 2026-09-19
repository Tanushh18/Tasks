import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const vehicleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
  },
  { timestamps: true }
);

export type VehicleRecord = HydratedDocument<InferSchemaType<typeof vehicleSchema>>;

export const Vehicle = model("Vehicle", vehicleSchema);
