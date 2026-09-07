import { Router } from "express";
import * as adminController from "../controllers/adminController";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { idParamSchema } from "../validators/adminValidators";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/", adminController.listUsers);
router.post("/:id/block", validateRequest({ params: idParamSchema }), adminController.blockUser);
router.post("/:id/unblock", validateRequest({ params: idParamSchema }), adminController.unblockUser);
router.post("/:id/reset-mpin", validateRequest({ params: idParamSchema }), adminController.resetMpin);

export default router;
