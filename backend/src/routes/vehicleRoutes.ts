import { Router } from "express";
import * as vehicleController from "../controllers/vehicleController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import { createVehicleSchema, idParamSchema, updateVehicleSchema } from "../validators/vehicleValidators";
import vehicleDocumentRoutes from "./vehicleDocumentRoutes";

const router = Router();

router.use(requireAuth, requireFeature("vehicleManagement"));

router.get("/", vehicleController.listVehicles);
router.post("/", validateRequest({ body: createVehicleSchema }), vehicleController.createVehicle);
router.get("/:id", validateRequest({ params: idParamSchema }), vehicleController.getVehicle);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateVehicleSchema }),
  vehicleController.updateVehicle
);
router.delete("/:id", validateRequest({ params: idParamSchema }), vehicleController.deleteVehicle);

router.use("/:vehicleId/documents", vehicleDocumentRoutes);

export default router;
