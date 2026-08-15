import { Router } from "express";
import * as taskController from "../controllers/taskController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/upcoming", taskController.getUpcomingReminders);

export default router;
