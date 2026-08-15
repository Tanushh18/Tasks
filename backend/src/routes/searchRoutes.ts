import { Router } from "express";
import { z } from "zod";
import { search } from "../controllers/searchController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

router.use(requireAuth);
router.get("/", validateRequest({ query: z.object({ q: z.string().trim().min(1).max(100) }) }), search);

export default router;
