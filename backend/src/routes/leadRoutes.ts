import express, { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as controller from "../controllers/leadController";
import { asyncHandler } from "../utils/asyncHandler";

const c = Object.fromEntries(
  Object.entries(controller).map(([k, f]) => [k, asyncHandler(f as Parameters<typeof asyncHandler>[0])])
) as typeof controller;

const router = Router();

// No sign-in: bulk import for scripts (README "Bulk lead import"). Accepts JSON, or raw CSV as text/csv.
router.post("/bulk-import", express.text({ type: ["text/csv", "text/plain"], limit: "20mb" }), c.publicBulkImport);

router.use(requireAuth);
router.get("/meta", c.meta);
router.get("/", c.listLeads);
router.post("/import", c.importLeads);
router.post("/lookup", c.lookupPhones);
router.post("/admin/import", c.adminImport);
router.patch("/:id", c.updateLead);
router.delete("/:id", c.deleteLead);
router.get("/sources/list", c.listSources);
router.post("/sources", c.addSource);
router.patch("/sources/:id", c.updateSource);
router.delete("/sources/:id", c.deleteSource);
router.post("/sources/:id/share", c.shareSource);
router.delete("/sources/:id/share/:userId", c.unshareSource);
router.post("/sync", c.syncAll);

export default router;
