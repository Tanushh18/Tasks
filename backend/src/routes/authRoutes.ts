import { Router } from "express";
import * as authController from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rateLimiter";
import { validateRequest } from "../middleware/validateRequest";
import { changeMpinSchema, loginSchema, refreshSchema, registerSchema } from "../validators/authValidators";

const router = Router();

router.post("/register", registerRateLimiter, validateRequest({ body: registerSchema }), authController.register);
router.post("/login", loginRateLimiter, validateRequest({ body: loginSchema }), authController.login);
router.post("/refresh", validateRequest({ body: refreshSchema }), authController.refresh);
router.post("/logout", requireAuth, authController.logout);
router.post(
  "/change-mpin",
  requireAuth,
  validateRequest({ body: changeMpinSchema }),
  authController.changeMpin
);
router.get("/me", requireAuth, authController.me);
router.put("/settings", requireAuth, authController.updateSettings);
router.delete("/account", requireAuth, authController.deleteAccount);

export default router;
