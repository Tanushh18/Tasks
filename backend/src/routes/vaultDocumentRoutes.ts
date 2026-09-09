import { Router } from "express";
import * as vaultDocumentController from "../controllers/vaultDocumentController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  createVaultDocumentSchema,
  idParamSchema,
  updateVaultDocumentSchema,
} from "../validators/vaultDocumentValidators";

const router = Router();

router.use(requireAuth, requireFeature("documentVault"));

router.get("/", vaultDocumentController.listDocuments);
router.post("/", validateRequest({ body: createVaultDocumentSchema }), vaultDocumentController.createDocument);
router.get("/:id", validateRequest({ params: idParamSchema }), vaultDocumentController.getDocument);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateVaultDocumentSchema }),
  vaultDocumentController.updateDocument
);
router.delete("/:id", validateRequest({ params: idParamSchema }), vaultDocumentController.deleteDocument);

export default router;
