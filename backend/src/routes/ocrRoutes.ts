import { Router } from "express";
import * as ocrController from "../controllers/ocrController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import { scanImageSchema } from "../validators/ocrValidators";

const router = Router();

router.use(requireAuth, requireFeature("ocr"));

router.post("/scan", validateRequest({ body: scanImageSchema }), ocrController.scan);

export default router;
