import { apiClient } from "./client";

/** Photos and videos for the ShineOne Estate website, kept per project (Sector 4, 9, 42, 46, Reliance Met City). */

export type MediaKind = "image" | "video";

export interface MediaItem {
  publicId: string;
  kind: MediaKind;
  url: string;
  thumb: string;
  bytes: number;
  createdAt: string;
}

export interface MediaProject {
  key: string;
  label: string;
  items: MediaItem[];
}

export interface UploadSignature {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  tags: string;
}

export interface PickedMedia {
  uri: string;
  kind: MediaKind;
  fileName?: string | null;
  mimeType?: string | null;
}

export async function listProjects(): Promise<{ configured: boolean; projects: MediaProject[] }> {
  const { data } = await apiClient.get("/shine-media/projects", { _noCache: true } as object);
  return data;
}

export async function signUpload(project: string, kind: MediaKind): Promise<UploadSignature> {
  const { data } = await apiClient.post("/shine-media/sign", { project, kind });
  return data;
}

export async function markUploaded(): Promise<void> {
  await apiClient.post("/shine-media/uploaded", {});
}

export async function deleteMedia(item: Pick<MediaItem, "publicId" | "kind">): Promise<void> {
  await apiClient.post("/shine-media/delete", { publicId: item.publicId, kind: item.kind });
}

/** Sends one file straight to Cloudinary (big videos never pass through our server), reporting 0–1 progress. */
export function uploadToCloudinary(sig: UploadSignature, file: PickedMedia, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    const name = file.fileName || `${file.kind === "video" ? "video" : "photo"}-${Date.now()}`;
    const type = file.mimeType || (file.kind === "video" ? "video/mp4" : "image/jpeg");
    form.append("file", { uri: file.uri, name, type } as unknown as Blob);
    form.append("api_key", sig.apiKey);
    form.append("timestamp", String(sig.timestamp));
    form.append("signature", sig.signature);
    form.append("folder", sig.folder);
    form.append("tags", sig.tags);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", sig.uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText)?.error?.message ?? message;
      } catch {
        /* keep the generic message */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("No connection. Check your internet and try again."));
    xhr.send(form);
  });
}

/** Signs and uploads each file in turn. Returns how many went through and the first error message, if any. */
export async function uploadMany(
  project: string,
  files: PickedMedia[],
  onProgress: (state: { index: number; total: number; fraction: number }) => void
): Promise<{ uploaded: number; error: string | null }> {
  let uploaded = 0;
  let error: string | null = null;
  for (let i = 0; i < files.length; i++) {
    try {
      const sig = await signUpload(project, files[i].kind);
      await uploadToCloudinary(sig, files[i], (fraction) => onProgress({ index: i, total: files.length, fraction }));
      uploaded++;
    } catch (e) {
      error = error ?? (e instanceof Error ? e.message : "Upload failed");
    }
  }
  if (uploaded > 0) await markUploaded().catch(() => undefined);
  return { uploaded, error };
}

/* ── Website project status (progress %, stage, ETA) ── */

export const SITE_STAGES = ["Foundation", "Structure", "Finishing", "Interior Works", "Final Inspection", "Handover"] as const;

export interface SiteProject {
  key: string;
  name: string;
  status: "Completed" | "Ongoing";
  area: string;
  progress: number;
  stage: string;
  eta: string;
}

export type SiteProjectUpdate = Partial<Pick<SiteProject, "status" | "area" | "progress" | "stage" | "eta">>;

export async function getSite(): Promise<{ projects: SiteProject[]; updatedAt: string | null }> {
  const { data } = await apiClient.get("/shine-media/site", { _noCache: true } as object);
  return data;
}

export async function updateSiteProject(key: string, update: SiteProjectUpdate): Promise<{ projects: SiteProject[] }> {
  const { data } = await apiClient.put(`/shine-media/site/${encodeURIComponent(key)}`, update);
  return data;
}
