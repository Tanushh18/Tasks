import { Router } from "express";
import * as chatController from "../controllers/chatController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import { listMessagesQuerySchema, sendMessageSchema, withUserIdParamSchema } from "../validators/chatValidators";

const router = Router();

router.use(requireAuth, requireFeature("chat"));

router.get("/conversations", chatController.listConversations);
router.get(
  "/messages/:withUserId",
  validateRequest({ params: withUserIdParamSchema, query: listMessagesQuerySchema }),
  chatController.listMessages
);
router.post(
  "/messages/:withUserId",
  validateRequest({ params: withUserIdParamSchema, body: sendMessageSchema }),
  chatController.sendMessage
);

export default router;
