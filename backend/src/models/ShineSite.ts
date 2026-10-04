import { Schema, model } from "mongoose";

/** Single document ("shine") holding the ShineOne website's project status. */
const projectSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    status: { type: String, enum: ["Completed", "Ongoing"], required: true },
    area: { type: String, default: "" },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    stage: { type: String, default: "" },
    eta: { type: String, default: "" },
  },
  { _id: false }
);

const shineSiteSchema = new Schema(
  {
    _id: { type: String, default: "shine" },
    projects: { type: [projectSchema], default: [] },
  },
  { timestamps: true }
);

export const ShineSite = model("ShineSite", shineSiteSchema);
