import { Router } from "express";
import * as locationController from "../controllers/locationController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { pingSchema, startSharingSchema, toUserIdParamSchema } from "../validators/locationValidators";

const router = Router();

router.use(requireAuth);

router.post("/ping", validateRequest({ body: pingSchema }), locationController.ping);
router.get("/shares", locationController.getShares);
router.post("/shares", validateRequest({ body: startSharingSchema }), locationController.startSharing);
router.delete(
  "/shares/:toUserId",
  validateRequest({ params: toUserIdParamSchema }),
  locationController.stopSharing
);

export default router;
