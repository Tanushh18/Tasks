import { Router } from "express";
import * as contactController from "../controllers/contactController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { createContactSchema, idParamSchema, updateContactSchema } from "../validators/contactValidators";

const router = Router();

router.use(requireAuth);

router.get("/", contactController.listContacts);
router.post("/", validateRequest({ body: createContactSchema }), contactController.createContact);
router.get("/:id", validateRequest({ params: idParamSchema }), contactController.getContact);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateContactSchema }),
  contactController.updateContact
);
router.delete("/:id", validateRequest({ params: idParamSchema }), contactController.deleteContact);

export default router;
