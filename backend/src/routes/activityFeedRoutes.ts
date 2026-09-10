import { Router } from "express";
import * as activityFeedController from "../controllers/activityFeedController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", activityFeedController.getActivityFeed);

export default router;
