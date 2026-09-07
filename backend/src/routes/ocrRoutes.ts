import { Router } from "express";
import * as ocrController from "../controllers/ocrController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { scanImageSchema } from "../validators/ocrValidators";

const router = Router();

router.use(requireAuth);

router.post("/scan", validateRequest({ body: scanImageSchema }), ocrController.scan);

export default router;
