import { Router } from "express";
import * as groupExpenseController from "../controllers/groupExpenseController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  createExpenseSchema,
  createGroupSchema,
  createSettlementSchema,
  groupIdParamSchema,
  idParamSchema,
  updateExpenseSchema,
  updateGroupSchema,
} from "../validators/groupExpenseValidators";

const router = Router();

router.use(requireAuth, requireFeature("groupExpenses"));

router.get("/", groupExpenseController.listGroups);
router.post("/", validateRequest({ body: createGroupSchema }), groupExpenseController.createGroup);
router.get(
  "/:groupId",
  validateRequest({ params: groupIdParamSchema }),
  groupExpenseController.getGroup
);
router.put(
  "/:groupId",
  validateRequest({ params: groupIdParamSchema, body: updateGroupSchema }),
  groupExpenseController.updateGroup
);
router.delete(
  "/:groupId",
  validateRequest({ params: groupIdParamSchema }),
  groupExpenseController.deleteGroup
);

router.get(
  "/:groupId/balances",
  validateRequest({ params: groupIdParamSchema }),
  groupExpenseController.getBalances
);

router.get(
  "/:groupId/expenses",
  validateRequest({ params: groupIdParamSchema }),
  groupExpenseController.listExpenses
);
router.post(
  "/:groupId/expenses",
  validateRequest({ params: groupIdParamSchema, body: createExpenseSchema }),
  groupExpenseController.addExpense
);
router.put(
  "/:groupId/expenses/:id",
  validateRequest({ params: groupIdParamSchema.merge(idParamSchema), body: updateExpenseSchema }),
  groupExpenseController.updateExpense
);
router.delete(
  "/:groupId/expenses/:id",
  validateRequest({ params: groupIdParamSchema.merge(idParamSchema) }),
  groupExpenseController.deleteExpense
);

router.get(
  "/:groupId/settlements",
  validateRequest({ params: groupIdParamSchema }),
  groupExpenseController.listSettlements
);
router.post(
  "/:groupId/settlements",
  validateRequest({ params: groupIdParamSchema, body: createSettlementSchema }),
  groupExpenseController.addSettlement
);

export default router;
