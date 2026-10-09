import express, { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as controller from "../controllers/leadController";
import * as templateController from "../controllers/whatsAppTemplateController";
import { validateRequest } from "../middleware/validateRequest";
import { createTemplateSchema, idParamSchema, improveSchema, updateTemplateSchema } from "../validators/whatsAppTemplateValidators";
import { asyncHandler } from "../utils/asyncHandler";

const c = Object.fromEntries(
  Object.entries(controller).map(([k, f]) => [k, asyncHandler(f as Parameters<typeof asyncHandler>[0])])
) as typeof controller;

const t = Object.fromEntries(
  Object.entries(templateController).map(([k, f]) => [k, asyncHandler(f as Parameters<typeof asyncHandler>[0])])
) as typeof templateController;

const router = Router();

// No sign-in: bulk import for scripts (README "Bulk lead import"). Accepts JSON, or raw CSV as text/csv.
router.post("/bulk-import", express.text({ type: ["text/csv", "text/plain"], limit: "20mb" }), c.publicBulkImport);

router.use(requireAuth);
router.get("/meta", c.meta);
router.get("/", c.listLeads);
router.get("/origins", c.listOrigins);
router.post("/origins/rename", c.renameOrigin);
router.post("/lists", c.createList);
router.post("/import", c.importLeads);
router.post("/lookup", c.lookupPhones);
router.post("/admin/import", c.adminImport);
router.post("/admin/seed-olf", c.seedOlf);

// WhatsApp message templates (shared by everyone, applied per sheet). Registered before "/:id".
router.get("/whatsapp-templates", t.listTemplates);
router.get("/whatsapp-templates/status", t.templateStatus);
router.post("/whatsapp-templates/improve", validateRequest({ body: improveSchema }), t.improveTemplate);
router.post("/whatsapp-templates", validateRequest({ body: createTemplateSchema }), t.createTemplate);
router.patch("/whatsapp-templates/:id", validateRequest({ params: idParamSchema, body: updateTemplateSchema }), t.updateTemplate);
router.delete("/whatsapp-templates/:id", validateRequest({ params: idParamSchema }), t.deleteTemplate);

// Read-only Auto SMS numbers for the SMS status screen. Registered before "/:id".
router.get("/sms-summary", c.smsSummary);

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
