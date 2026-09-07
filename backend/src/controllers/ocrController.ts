import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as ocrService from "../services/ocrService";

export const scan = asyncHandler(async (req: Request, res: Response) => {
  const { image, target } = req.body as { image: string; target: "contact" | "receipt" };

  if (target === "contact") {
    const contact = await ocrService.extractContactFromImage(image);
    res.json({ contact });
    return;
  }

  const receipt = await ocrService.extractReceiptFromImage(image);
  res.json({ receipt });
});
