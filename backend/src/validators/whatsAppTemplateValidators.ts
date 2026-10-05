import { z } from "zod";

/** ~2 MB of image, as base64 inside a data URL. */
export const MAX_TEMPLATE_IMAGE_BYTES = 2 * 1024 * 1024;

const sheets = z
  .array(z.string().trim().min(1).max(120))
  .max(100)
  .transform((a) => a.filter((s, i) => a.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i));

/** `imageUrl`: a data:image/... URL (new upload), an existing https URL (kept as is), or ""/null (no image). */
const imageUrl = z
  .string()
  .max(4_000_000)
  .nullable()
  .refine((v) => !v || /^https:\/\//i.test(v) || /^data:image\/(png|jpe?g|webp);base64,/i.test(v), "Image must be a PNG, JPEG or WebP")
  .refine((v) => {
    if (!v || !v.startsWith("data:")) return true;
    const b64 = v.slice(v.indexOf(",") + 1);
    return Math.floor((b64.length * 3) / 4) <= MAX_TEMPLATE_IMAGE_BYTES;
  }, "Image is too large (2 MB max)");

const templateFields = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(80),
  /** Optional when the template has an image: an image-only template sends just the picture. */
  text: z.string().trim().max(2000).optional().default(""),
  imageUrl: imageUrl.optional(),
  sheets: sheets.optional().default([]),
});

export const createTemplateSchema = templateFields.refine((v) => v.text.length > 0 || !!v.imageUrl, {
  message: "Add a message or an image",
  path: ["text"],
});

export const updateTemplateSchema = templateFields.partial();

export const idParamSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id") });

export const improveSchema = z.object({
  text: z.string().trim().min(1, "Write your rough message first").max(2000),
});
