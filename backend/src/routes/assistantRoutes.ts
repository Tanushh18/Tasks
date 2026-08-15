import { Router } from "express";
import * as assistantController from "../controllers/assistantController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { assistantConfirmSchema, assistantMessageSchema } from "../validators/assistantValidators";

const router = Router();

router.use(requireAuth);

router.post("/message", validateRequest({ body: assistantMessageSchema }), assistantController.sendMessage);
router.post(
  "/confirm",
  validateRequest({ body: assistantConfirmSchema }),
  assistantController.respondToConfirmation
);

export default router;
