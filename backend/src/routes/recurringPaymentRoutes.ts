import { Router } from "express";
import * as recurringPaymentController from "../controllers/recurringPaymentController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  createRecurringPaymentSchema,
  idParamSchema,
  markPaidSchema,
  updateRecurringPaymentSchema,
} from "../validators/recurringPaymentValidators";

const router = Router();

router.use(requireAuth, requireFeature("recurringPayments"));

router.get("/", recurringPaymentController.listPayments);
router.post("/", validateRequest({ body: createRecurringPaymentSchema }), recurringPaymentController.createPayment);
router.get("/:id", validateRequest({ params: idParamSchema }), recurringPaymentController.getPayment);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateRecurringPaymentSchema }),
  recurringPaymentController.updatePayment
);
router.delete("/:id", validateRequest({ params: idParamSchema }), recurringPaymentController.deletePayment);
router.post(
  "/:id/mark-paid",
  validateRequest({ params: idParamSchema, body: markPaidSchema }),
  recurringPaymentController.markPaid
);

export default router;
