import { Router } from "express";
import * as userController from "../controllers/userController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { searchUsersQuerySchema } from "../validators/userValidators";

const router = Router();

router.use(requireAuth);

router.get("/", validateRequest({ query: searchUsersQuerySchema }), userController.searchUsers);

export default router;
