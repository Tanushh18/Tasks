import { z } from "zod";
import { ShineSite } from "../models/ShineSite";
import { ApiError } from "../utils/ApiError";

/**
 * Project status for the ShineOne Estate website (progress %, current stage, ETA).
 * One document holds every project; until someone edits it the website gets the defaults below,
 * which match what the site used to have built in.
 */

export const SHINE_STAGES = ["Foundation", "Structure", "Finishing", "Interior Works", "Final Inspection", "Handover"] as const;

export interface ShineSiteProject {
  /** Same key as the media folder ("sec 4"). */
  key: string;
  name: string;
  status: "Completed" | "Ongoing";
  area: string;
  /** 0–100. Completed projects are always 100. */
  progress: number;
  /** Current stage for ongoing projects ("" lets the website work it out). */
  stage: string;
  eta: string;
}

export const DEFAULT_SHINE_PROJECTS: ShineSiteProject[] = [
  { key: "sec 4", name: "Sector 4", status: "Completed", area: "5700 Sq. Feet", progress: 100, stage: "", eta: "" },
  { key: "sec 9", name: "Sector 9", status: "Completed", area: "4200 Sq. Feet", progress: 100, stage: "", eta: "" },
  { key: "sec 46", name: "Sector 46", status: "Completed", area: "4500 Sq. Feet", progress: 100, stage: "", eta: "" },
  { key: "sec 42", name: "Sector 42", status: "Ongoing", area: "3200 Sq. Feet", progress: 78, stage: "", eta: "June 2026" },
  { key: "reliance met city", name: "Reliance MET City", status: "Ongoing", area: "1620 Sq. Feet", progress: 8, stage: "Foundation", eta: "June 2027" },
];

export const projectUpdateSchema = z
  .object({
    status: z.enum(["Completed", "Ongoing"]).optional(),
    area: z.string().trim().max(60).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    stage: z.union([z.enum(SHINE_STAGES), z.literal("")]).optional(),
    eta: z.string().trim().max(40).optional(),
  })
  .strict();

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

const CACHE_MS = 60_000;
let cache: { at: number; data: { projects: ShineSiteProject[]; updatedAt: string | null } } | null = null;

export function clearShineSiteCache() {
  cache = null;
}

/** Saved values over the defaults, in the defaults' order (new default projects appear automatically). */
function merge(saved: Partial<ShineSiteProject>[] | undefined): ShineSiteProject[] {
  const byKey = new Map((saved ?? []).map((p) => [p.key, p]));
  return DEFAULT_SHINE_PROJECTS.map((d) => {
    const s = byKey.get(d.key) ?? {};
    const merged: ShineSiteProject = {
      ...d,
      status: (s.status as ShineSiteProject["status"]) ?? d.status,
      area: s.area ?? d.area,
      progress: typeof s.progress === "number" ? s.progress : d.progress,
      stage: s.stage ?? d.stage,
      eta: s.eta ?? d.eta,
    };
    if (merged.status === "Completed") { merged.progress = 100; merged.stage = ""; }
    return merged;
  });
}

export async function getShineSite() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const doc = await ShineSite.findById("shine").lean();
  const data = { projects: merge(doc?.projects as Partial<ShineSiteProject>[] | undefined), updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null };
  cache = { at: Date.now(), data };
  return data;
}

export async function updateShineProject(key: string, update: ProjectUpdate) {
  if (!DEFAULT_SHINE_PROJECTS.some((p) => p.key === key)) throw ApiError.badRequest("Unknown project");
  const current = (await getShineSite()).projects;
  const projects = current.map((p) => (p.key === key ? { ...p, ...update } : p));
  await ShineSite.findByIdAndUpdate("shine", { projects }, { upsert: true, setDefaultsOnInsert: true });
  clearShineSiteCache();
  return getShineSite();
}
