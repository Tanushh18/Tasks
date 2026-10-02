import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export type StoredResourceType = "image" | "raw";

export interface StoredFile {
  /** What goes in the document's `fileData` field: an https Cloudinary URL, or the original data URL
   * when Cloudinary isn't configured (so uploads keep working in local dev and before setup). */
  url: string;
  publicId: string | null;
  resourceType: StoredResourceType | null;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });
  configured = true;
}

export function isDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

/**
 * Photos go up as `image` (Cloudinary can resize/compress them on delivery); PDFs and Word files
 * go up as `raw` so they are always deliverable — image-type PDFs are blocked on accounts that
 * haven't enabled "Allow delivery of PDF and ZIP files".
 */
function resourceTypeFor(dataUrl: string): StoredResourceType {
  return /^data:image\//i.test(dataUrl) ? "image" : "raw";
}

/** Uploads a `data:<mime>;base64,...` file. Anything that isn't a data URL is returned as-is. */
export async function storeFile(dataUrl: string, folder: string): Promise<StoredFile> {
  if (!isDataUrl(dataUrl) || !isCloudinaryConfigured()) {
    return { url: dataUrl, publicId: null, resourceType: null };
  }
  ensureConfigured();
  const resourceType = resourceTypeFor(dataUrl);
  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: `${env.cloudinaryFolder}/${folder}`,
      resource_type: resourceType,
    });
    return { url: result.secure_url, publicId: result.public_id, resourceType };
  } catch (err) {
    console.error("Cloudinary upload failed", err);
    throw ApiError.badRequest("We couldn't upload that file. Please try again.");
  }
}

/** Best-effort: a failed cleanup must never block deleting or replacing the record itself. */
export async function removeFile(publicId: string | null | undefined, resourceType?: string | null): Promise<void> {
  if (!publicId || !isCloudinaryConfigured()) return;
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType === "raw" ? "raw" : "image" });
  } catch (err) {
    console.error("Cloudinary delete failed", err);
  }
}
