import cors from "cors";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as controller from "../controllers/shineMediaController";
import { asyncHandler } from "../utils/asyncHandler";

const c = Object.fromEntries(
  Object.entries(controller).map(([k, f]) => [k, asyncHandler(f as Parameters<typeof asyncHandler>[0])])
) as typeof controller;

export const shinePublicRouter = Router();
// Read-only and public: any website may read it, whatever CORS_ORIGIN says for the app.
shinePublicRouter.get("/media", cors({ origin: true, methods: ["GET"] }), c.publicMedia);

const router = Router();
router.use(requireAuth);
router.get("/projects", c.listProjects);
router.post("/sign", c.signUpload);
router.post("/uploaded", c.uploaded);
router.post("/delete", c.removeMedia);
export default router;
