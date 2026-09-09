import { Router } from "express";
import * as shoppingListController from "../controllers/shoppingListController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  addItemSchema,
  createListSchema,
  itemIdParamSchema,
  listIdParamSchema,
  setItemCheckedSchema,
  updateListSchema,
} from "../validators/shoppingListValidators";

const router = Router();

router.use(requireAuth, requireFeature("shoppingLists"));

router.get("/", shoppingListController.listLists);
router.post("/", validateRequest({ body: createListSchema }), shoppingListController.createList);
router.get("/:listId", validateRequest({ params: listIdParamSchema }), shoppingListController.getList);
router.put(
  "/:listId",
  validateRequest({ params: listIdParamSchema, body: updateListSchema }),
  shoppingListController.updateList
);
router.delete("/:listId", validateRequest({ params: listIdParamSchema }), shoppingListController.deleteList);

router.post(
  "/:listId/items",
  validateRequest({ params: listIdParamSchema, body: addItemSchema }),
  shoppingListController.addItem
);
router.put(
  "/:listId/items/:itemId",
  validateRequest({ params: listIdParamSchema.merge(itemIdParamSchema), body: setItemCheckedSchema }),
  shoppingListController.setItemChecked
);
router.delete(
  "/:listId/items/:itemId",
  validateRequest({ params: listIdParamSchema.merge(itemIdParamSchema) }),
  shoppingListController.removeItem
);

export default router;
