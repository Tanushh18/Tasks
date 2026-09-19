import { Router } from "express";
import * as vehicleDocumentController from "../controllers/vehicleDocumentController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  createVehicleDocumentSchema,
  idParamSchema,
  updateVehicleDocumentSchema,
  vehicleIdParamSchema,
} from "../validators/vehicleDocumentValidators";

const router = Router({ mergeParams: true });

router.use(requireAuth, requireFeature("vehicleManagement"));

router.get("/", validateRequest({ params: vehicleIdParamSchema }), vehicleDocumentController.listDocuments);
router.post(
  "/",
  validateRequest({ params: vehicleIdParamSchema, body: createVehicleDocumentSchema }),
  vehicleDocumentController.createDocument
);
router.get("/:id", validateRequest({ params: idParamSchema }), vehicleDocumentController.getDocument);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateVehicleDocumentSchema }),
  vehicleDocumentController.updateDocument
);
router.delete("/:id", validateRequest({ params: idParamSchema }), vehicleDocumentController.deleteDocument);

export default router;
