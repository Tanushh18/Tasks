import type { Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import {
  SHINE_PROJECTS,
  deleteShineMedia,
  findProject,
  isShineConfigured,
  listAllShineMedia,
  ownsPublicId,
  signShineUpload,
  clearShineCache,
  type MediaKind,
} from "../services/shineMediaService";
import { getShineSite, projectUpdateSchema, updateShineProject } from "../services/shineSiteService";

const kindOf = (v: unknown): MediaKind => {
  if (v === "image" || v === "video") return v;
  throw ApiError.badRequest("kind must be image or video");
};

/** Signed-in: projects with their files, for the app's Media tab. */
export async function listProjects(_req: Request, res: Response) {
  if (!isShineConfigured()) {
    res.json({ configured: false, projects: SHINE_PROJECTS.map((p) => ({ key: p.key, label: p.label, items: [] })) });
    return;
  }
  const all = await listAllShineMedia();
  res.json({
    configured: true,
    projects: SHINE_PROJECTS.map((p) => ({ key: p.key, label: p.label, items: all.get(p.key) ?? [] })),
  });
}

export async function signUpload(req: Request, res: Response) {
  const project = findProject(String(req.body?.project ?? ""));
  if (!project) throw ApiError.badRequest("Unknown project");
  const kind = kindOf(req.body?.kind);
  res.json(signShineUpload(project, kind));
}

/** The phone calls this after each upload so the list the website reads is refreshed right away. */
export async function uploaded(_req: Request, res: Response) {
  clearShineCache();
  res.json({ ok: true });
}

export async function removeMedia(req: Request, res: Response) {
  const publicId = String(req.body?.publicId ?? "");
  if (!publicId || !ownsPublicId(publicId)) throw ApiError.badRequest("That file can't be removed here.");
  await deleteShineMedia(publicId, kindOf(req.body?.kind));
  res.json({ ok: true });
}

/** No sign-in: what the ShineOne website shows. { folders: { "sec 4": [url, ...], ... } } */
export async function publicMedia(_req: Request, res: Response) {
  if (!isShineConfigured()) throw new ApiError(503, "NOT_CONFIGURED", "Website media is not set up.");
  const all = await listAllShineMedia();
  const folders: Record<string, string[]> = {};
  for (const p of SHINE_PROJECTS) folders[p.key] = (all.get(p.key) ?? []).map((i) => i.url);
  res.set("Cache-Control", "public, max-age=60");
  res.json({ folders });
}

/** No sign-in: project status the website shows (progress %, stage, ETA). */
export async function publicSite(_req: Request, res: Response) {
  const site = await getShineSite();
  res.set("Cache-Control", "public, max-age=60");
  res.json(site);
}

/** Signed-in: same data, uncached, for the app. */
export async function getSite(_req: Request, res: Response) {
  res.json(await getShineSite());
}

/** Signed-in: change one project's status / progress / stage / ETA. */
export async function updateSiteProject(req: Request, res: Response) {
  const parsed = projectUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid project update");
  res.json(await updateShineProject(String(req.params.key ?? ""), parsed.data));
}
