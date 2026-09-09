import { Router } from "express";
import * as inventoryItemController from "../controllers/inventoryItemController";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/requireFeature";
import { validateRequest } from "../middleware/validateRequest";
import {
  createInventoryItemSchema,
  idParamSchema,
  updateInventoryItemSchema,
} from "../validators/inventoryItemValidators";

const router = Router();

router.use(requireAuth, requireFeature("householdInventory"));

// Static path must be registered before "/:id" or it would be swallowed by the param route.
router.get("/warranty-expiring", inventoryItemController.listWarrantyExpiring);

router.get("/", inventoryItemController.listItems);
router.post("/", validateRequest({ body: createInventoryItemSchema }), inventoryItemController.createItem);
router.get("/:id", validateRequest({ params: idParamSchema }), inventoryItemController.getItem);
router.put(
  "/:id",
  validateRequest({ params: idParamSchema, body: updateInventoryItemSchema }),
  inventoryItemController.updateItem
);
router.delete("/:id", validateRequest({ params: idParamSchema }), inventoryItemController.deleteItem);

export default router;
