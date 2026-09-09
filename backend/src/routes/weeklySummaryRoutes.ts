import { Router } from "express";
import * as weeklySummaryController from "../controllers/weeklySummaryController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";

const router = Router();

router.use(requireAuth, requireFeature("weeklySummary"));

router.get("/", weeklySummaryController.getWeeklySummary);

export default router;
