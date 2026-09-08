import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getFlags } from "../models/FeatureFlags";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const flags = await getFlags();
    res.json({
      features: {
        contacts: flags.contacts,
        chat: flags.chat,
        ocr: flags.ocr,
        location: flags.location,
        assistant: flags.assistant,
        notes: flags.notes,
        groupExpenses: flags.groupExpenses,
      },
    });
  })
);

export default router;
