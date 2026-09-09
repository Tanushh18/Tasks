import { Router } from "express";
import * as pollController from "../controllers/pollController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import { createPollSchema, idParamSchema, listPollsQuerySchema, voteSchema } from "../validators/pollValidators";

const router = Router();

router.use(requireAuth, requireFeature("polls"));

router.get("/", validateRequest({ query: listPollsQuerySchema }), pollController.listPolls);
router.post("/", validateRequest({ body: createPollSchema }), pollController.createPoll);
router.get("/:id", validateRequest({ params: idParamSchema }), pollController.getPoll);
router.post(
  "/:id/vote",
  validateRequest({ params: idParamSchema, body: voteSchema }),
  pollController.votePoll
);
router.post("/:id/close", validateRequest({ params: idParamSchema }), pollController.closePoll);

export default router;
