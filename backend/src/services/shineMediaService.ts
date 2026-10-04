import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * Photos and videos for the ShineOne Estate website. They live in their own Cloudinary account
 * (the *_shine variables), so every call passes those credentials instead of using the global
 * cloudinary.config() the Vault relies on.
 */

export type MediaKind = "image" | "video";

export interface ShineProject {
  /** Folder name under ShineOne/ and the key the website uses ("sec 4"). */
  key: string;
  label: string;
  tag: string;
  /** Older uploads that sit outside the project's folder; still listed (and deletable). */
  extraIds: string[];
}

export const SHINE_PROJECTS: ShineProject[] = [
  { key: "sec 4", label: "Sector 4", tag: "sec4", extraIds: [] },
  { key: "sec 9", label: "Sector 9", tag: "sec9", extraIds: [] },
  { key: "sec 42", label: "Sector 42", tag: "sec42", extraIds: ["WhatsApp_Image_2026-09-05_at_22.53.10"] },
  { key: "sec 46", label: "Sector 46", tag: "sec46", extraIds: [] },
  {
    key: "reliance met city",
    label: "Reliance Met City",
    tag: "reliancemetcity",
    extraIds: [
      "WhatsApp_Image_2026-08-20_at_18.08.54",
      "WhatsApp_Image_2026-09-18_at_11.32.44",
      "WhatsApp_Image_2026-09-22_at_11.59.05",
    ],
  },
];

export interface ShineMediaItem {
  publicId: string;
  kind: MediaKind;
  /** What the website shows: the original image, or an .mp4 of the video. */
  url: string;
  /** Small picture for the app's grid (a still frame for videos). */
  thumb: string;
  bytes: number;
  createdAt: string;
}

const CACHE_MS = 60_000;
let cache: { at: number; data: Map<string, ShineMediaItem[]> } | null = null;

export function isShineConfigured(): boolean {
  return Boolean(env.shineCloudName && env.shineApiKey && env.shineApiSecret);
}

function creds() {
  if (!isShineConfigured()) throw new ApiError(503, "NOT_CONFIGURED", "Website media is not set up on the server yet.");
  return { cloud_name: env.shineCloudName, api_key: env.shineApiKey, api_secret: env.shineApiSecret, secure: true };
}

export function findProject(key: string): ShineProject | undefined {
  return SHINE_PROJECTS.find((p) => p.key === key);
}

export function clearShineCache(): void {
  cache = null;
}

interface Resource {
  public_id: string;
  version: number;
  format?: string;
  bytes?: number;
  created_at?: string;
}

function toItem(r: Resource, kind: MediaKind): ShineMediaItem {
  const base = `https://res.cloudinary.com/${env.shineCloudName}/${kind}/upload`;
  const path = r.public_id.split("/").map(encodeURIComponent).join("/");
  const url = `${base}/v${r.version}/${path}.${kind === "video" ? "mp4" : (r.format ?? "jpg")}`;
  const thumb =
    kind === "video"
      ? `${base}/so_0,w_400,h_300,c_fill/v${r.version}/${path}.jpg`
      : `${base}/w_400,h_300,c_fill,q_auto/v${r.version}/${path}.${r.format ?? "jpg"}`;
  return { publicId: r.public_id, kind, url, thumb, bytes: r.bytes ?? 0, createdAt: r.created_at ?? "" };
}

async function listKind(project: ShineProject, kind: MediaKind): Promise<ShineMediaItem[]> {
  const options = { ...creds(), resource_type: kind };
  const out = new Map<string, ShineMediaItem>();
  let cursor: string | undefined;
  do {
    const page = (await cloudinary.api.resources({
      ...options,
      type: "upload",
      prefix: `ShineOne/${project.key}/`,
      max_results: 500,
      next_cursor: cursor,
    })) as { resources: Resource[]; next_cursor?: string };
    for (const r of page.resources) out.set(r.public_id, toItem(r, kind));
    cursor = page.next_cursor;
  } while (cursor);

  if (kind === "image" && project.extraIds.length > 0) {
    const extra = (await cloudinary.api.resources_by_ids(project.extraIds, { ...options, type: "upload" })) as {
      resources: Resource[];
    };
    for (const r of extra.resources) out.set(r.public_id, toItem(r, kind));
  }
  return [...out.values()];
}

/** Every project's photos and videos, newest first. Cached for a minute (cleared on upload/delete). */
export async function listAllShineMedia(): Promise<Map<string, ShineMediaItem[]>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = new Map<string, ShineMediaItem[]>();
  await Promise.all(
    SHINE_PROJECTS.map(async (p) => {
      const [images, videos] = await Promise.all([listKind(p, "image"), listKind(p, "video")]);
      data.set(
        p.key,
        [...images, ...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.publicId.localeCompare(b.publicId))
      );
    })
  );
  cache = { at: Date.now(), data };
  return data;
}

/** Parameters the phone sends to Cloudinary so it can upload straight there (large videos skip this server). */
export function signShineUpload(project: ShineProject, kind: MediaKind) {
  const c = creds();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `ShineOne/${project.key}`;
  const toSign = { folder, tags: project.tag, timestamp };
  const signature = cloudinary.utils.api_sign_request(toSign, c.api_secret);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${c.cloud_name}/${kind}/upload`,
    apiKey: c.api_key,
    timestamp,
    signature,
    folder,
    tags: project.tag,
  };
}

/** Only files that belong to a project may be removed through the app. */
export function ownsPublicId(publicId: string): boolean {
  return publicId.startsWith("ShineOne/") || SHINE_PROJECTS.some((p) => p.extraIds.includes(publicId));
}

export async function deleteShineMedia(publicId: string, kind: MediaKind): Promise<void> {
  const result = (await cloudinary.uploader.destroy(publicId, { ...creds(), resource_type: kind, invalidate: true })) as {
    result: string;
  };
  clearShineCache();
  if (result.result === "not found") throw ApiError.notFound("That file no longer exists.");
}
