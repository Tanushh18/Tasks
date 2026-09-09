import { Router } from "express";
import * as familyGoalController from "../controllers/familyGoalController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  createContributionSchema,
  createGoalSchema,
  goalIdParamSchema,
  idParamSchema,
  updateGoalSchema,
} from "../validators/familyGoalValidators";

const router = Router();

router.use(requireAuth, requireFeature("familyGoals"));

router.get("/", familyGoalController.listGoals);
router.post("/", validateRequest({ body: createGoalSchema }), familyGoalController.createGoal);
router.get("/:id", validateRequest({ params: idParamSchema }), familyGoalController.getGoal);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateGoalSchema }),
  familyGoalController.updateGoal
);
router.delete("/:id", validateRequest({ params: idParamSchema }), familyGoalController.deleteGoal);

router.get(
  "/:goalId/contributions",
  validateRequest({ params: goalIdParamSchema }),
  familyGoalController.listContributions
);
router.post(
  "/:goalId/contributions",
  validateRequest({ params: goalIdParamSchema, body: createContributionSchema }),
  familyGoalController.addContribution
);

export default router;
