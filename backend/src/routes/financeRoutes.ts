import { Router } from "express";
import * as financeController from "../controllers/financeController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import {
  createAccountSchema,
  createTransactionSchema,
  idParamSchema,
  listTransactionsQuerySchema,
  monthlyTrendQuerySchema,
  summaryQuerySchema,
  updateAccountSchema,
  updateTransactionSchema,
} from "../validators/financeValidators";

const router = Router();

router.use(requireAuth);

router.get("/accounts", financeController.listAccounts);
router.post("/accounts", validateRequest({ body: createAccountSchema }), financeController.createAccount);
router.put(
  "/accounts/:id",
  validateRequest({ params: idParamSchema, body: updateAccountSchema }),
  financeController.updateAccount
);
router.delete("/accounts/:id", validateRequest({ params: idParamSchema }), financeController.deleteAccount);

router.get(
  "/transactions",
  validateRequest({ query: listTransactionsQuerySchema }),
  financeController.listTransactions
);
router.post(
  "/transactions",
  validateRequest({ body: createTransactionSchema }),
  financeController.createTransaction
);
router.get(
  "/transactions/:id",
  validateRequest({ params: idParamSchema }),
  financeController.getTransaction
);
router.put(
  "/transactions/:id",
  validateRequest({ params: idParamSchema, body: updateTransactionSchema }),
  financeController.updateTransaction
);
router.delete(
  "/transactions/:id",
  validateRequest({ params: idParamSchema }),
  financeController.deleteTransaction
);

router.get("/summary", validateRequest({ query: summaryQuerySchema }), financeController.getSummary);
router.get(
  "/spending-analysis",
  validateRequest({ query: summaryQuerySchema }),
  financeController.getSpendingAnalysis
);
router.get(
  "/monthly-trend",
  validateRequest({ query: monthlyTrendQuerySchema }),
  financeController.getMonthlyTrend
);

export default router;
