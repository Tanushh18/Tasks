import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { asyncHandler } from "../utils/asyncHandler";
import { createSharedDocumentSchema, idParamSchema } from "../validators/sharedDocumentValidators";
import * as service from "../services/sharedDocumentService";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (_req, res) => {
  const docs = await service.listSharedDocuments();
  res.json({ documents: docs.map(service.serializeSharedDocument) });
}));

router.post("/", validateRequest({ body: createSharedDocumentSchema }), asyncHandler(async (req, res) => {
  const doc = await service.createSharedDocument(req.userId!, req.body);
  res.status(201).json({ document: service.serializeSharedDocument(doc) });
}));

router.delete("/:id", validateRequest({ params: idParamSchema }), asyncHandler(async (req, res) => {
  await service.deleteSharedDocument(req.userId!, !!req.isAdmin, req.params.id);
  res.status(204).send();
}));

export default router;
