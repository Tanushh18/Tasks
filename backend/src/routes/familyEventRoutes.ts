import { Router } from "express";
import * as familyEventController from "../controllers/familyEventController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  createEventSchema,
  idParamSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from "../validators/familyEventValidators";

const router = Router();

router.use(requireAuth, requireFeature("familyEvents"));

router.get("/", validateRequest({ query: listEventsQuerySchema }), familyEventController.listEvents);
router.post("/", validateRequest({ body: createEventSchema }), familyEventController.createEvent);
router.get("/:id", validateRequest({ params: idParamSchema }), familyEventController.getEvent);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateEventSchema }),
  familyEventController.updateEvent
);
router.delete("/:id", validateRequest({ params: idParamSchema }), familyEventController.deleteEvent);

export default router;
