import { Router } from "express";
import * as noteController from "../controllers/noteController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import { createNoteSchema, idParamSchema, updateNoteSchema } from "../validators/noteValidators";

const router = Router();

router.use(requireAuth, requireFeature("notes"));

router.get("/", noteController.listNotes);
router.post("/", validateRequest({ body: createNoteSchema }), noteController.createNote);
router.get("/:id", validateRequest({ params: idParamSchema }), noteController.getNote);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateNoteSchema }),
  noteController.updateNote
);
router.delete("/:id", validateRequest({ params: idParamSchema }), noteController.deleteNote);

export default router;
