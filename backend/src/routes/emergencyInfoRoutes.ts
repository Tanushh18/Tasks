import { Router } from "express";
import * as emergencyInfoController from "../controllers/emergencyInfoController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import { updateEmergencyInfoSchema, userIdParamSchema } from "../validators/emergencyInfoValidators";

const router = Router();

router.use(requireAuth, requireFeature("emergencyInfo"));

router.get("/", emergencyInfoController.getOwnInfo);
router.put("/", validateRequest({ body: updateEmergencyInfoSchema }), emergencyInfoController.updateOwnInfo);
// Visible to any registered user, not just the owner — see comment in emergencyInfoService.
router.get(
  "/:userId",
  validateRequest({ params: userIdParamSchema }),
  emergencyInfoController.getInfoForUser
);

export default router;
