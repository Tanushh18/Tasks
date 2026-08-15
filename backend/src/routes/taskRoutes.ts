import { Router } from "express";
import * as taskController from "../controllers/taskController";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  updateTaskSchema,
} from "../validators/taskValidators";

const router = Router();

router.use(requireAuth);

router.get("/counts", taskController.getTaskCounts);
router.get("/", validateRequest({ query: listTasksQuerySchema }), taskController.listTasks);
router.post("/", validateRequest({ body: createTaskSchema }), taskController.createTask);
router.get("/:id", validateRequest({ params: taskIdParamSchema }), taskController.getTask);
router.put(
  "/:id",
  validateRequest({ params: taskIdParamSchema, body: updateTaskSchema }),
  taskController.updateTask
);
router.patch("/:id/complete", validateRequest({ params: taskIdParamSchema }), taskController.completeTask);
router.patch(
  "/:id/notification",
  validateRequest({ params: taskIdParamSchema }),
  taskController.setTaskLocalNotificationId
);
router.delete("/:id", validateRequest({ params: taskIdParamSchema }), taskController.deleteTask);

export default router;
