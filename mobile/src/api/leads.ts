import { apiClient } from "./client";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  plotInFarukhNagar: string;
  plotManual: boolean;
  category: string;
  status: string;
  requirement: string;
  address: string;
  budget: string;
  notes: string;
  archived: boolean;
  sheetDate?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedByName?: string;
  statusUpdatedAt?: string | null;
  notInterestedAt?: string | null;
  alternatePhones?: string[];
  email?: string;
  /** Read-only context from an imported sheet (tower, flat, dealer…). */
  info?: string;
}

export interface StageCount {
  stage: string;
  count: number;
}

export interface LeadPage {
  leads: Lead[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  totalAll: number;
  stageCounts: StageCount[];
}

export interface LeadSource {
  id: string;
  url: string;
  label: string;
  sheetId: string;
  gid: string;
  enabled: boolean;
  lastCheckedAt?: string;
  lastSyncedAt?: string;
  lastError?: string;
  kind: "sheet" | "manual" | "import";
  allTabs?: boolean;
  isOwner: boolean;
  sharedWith: { id: string; name: string; mobileNumber: string }[];
}

export async function listLeads(search?: string, archived = false): Promise<Lead[]> {
  const { data } = await apiClient.get<{ leads: Lead[] }>("/leads", {
    params: { search: search || undefined, archived: archived || undefined },
  });
  return data.leads;
}

export const PAGE_SIZE = 10;

/** One page of leads. `status` "all" shows every stage; "New" includes leads with no stage yet. */
export async function listLeadsPage(opts: { page: number; status: string; search?: string; limit?: number; sourceId?: string }): Promise<LeadPage> {
  const { data } = await apiClient.get<LeadPage>("/leads", {
    params: {
      page: opts.page,
      limit: opts.limit ?? PAGE_SIZE,
      status: opts.status,
      search: opts.search || undefined,
      sourceId: opts.sourceId && opts.sourceId !== "all" ? opts.sourceId : undefined,
    },
  });
  return data;
}

export async function updateLead(id: string, body: Partial<Lead>): Promise<Lead> {
  const { data } = await apiClient.patch<{ lead: Lead }>(`/leads/${id}`, body);
  return data.lead;
}

export async function listSources(): Promise<LeadSource[]> {
  const { data } = await apiClient.get<{ sources: LeadSource[] }>("/leads/sources/list");
  return data.sources;
}

export async function addSource(url: string, label = "", allTabs = false): Promise<any> {
  const { data } = await apiClient.post<{ source: LeadSource; result: any }>(
    "/leads/sources",
    { url, label, allTabs }
  );
  return data;
}

export async function deleteSource(id: string): Promise<void> {
  await apiClient.delete(`/leads/sources/${id}`);
}

export async function syncLeads(): Promise<any> {
  const { data } = await apiClient.post("/leads/sync");
  return data;
}

export async function shareSource(id: string, mobileNumber: string): Promise<LeadSource> {
  const { data } = await apiClient.post<{ source: LeadSource }>(`/leads/sources/${id}/share`, { mobileNumber });
  return data.source;
}

export async function unshareSource(id: string, userId: string): Promise<LeadSource> {
  const { data } = await apiClient.delete<{ source: LeadSource }>(`/leads/sources/${id}/share/${userId}`);
  return data.source;
}

export const CATEGORY_OPTIONS = ["Construction", "Interior", "Sale / Purchase"];

export const DEFAULT_STATUS_OPTIONS = [
  "New",
  "Called — no answer",
  "Interested",
  "Site visit planned",
  "Follow-up",
  "Quotation sent",
  "Not interested",
  "Converted",
];

export interface LeadMeta {
  statusSuggestions: string[];
  notInterestedTtlDays?: number;
  isAdmin?: boolean;
}

export async function getLeadMeta(): Promise<LeadMeta> {
  const { data } = await apiClient.get<LeadMeta>("/leads/meta");
  return data;
}

export interface ImportContact {
  name: string;
  phone: string;
}

export interface ImportResult {
  added: number;
  existing: number;
  invalid: number;
}

export async function importLeads(contacts: ImportContact[]): Promise<ImportResult> {
  const { data } = await apiClient.post<ImportResult>("/leads/import", { contacts });
  return data;
}

/** Which of these numbers are already leads (normalised as +91XXXXXXXXXX). */
export async function lookupLeadPhones(phones: string[]): Promise<string[]> {
  const { data } = await apiClient.post<{ existing: string[] }>("/leads/lookup", { phones });
  return data?.existing ?? [];
}

export interface BulkImportSummary {
  rows: number;
  validUnique: number;
  noValidMobile: number;
  placeholders: number;
  duplicateRows: number;
  sharedWithYouAlready: number;
  added: number;
  updated: number;
  skippedDeleted: number;
}

export interface BulkImportResponse {
  dryRun: boolean;
  source: { id: string; label: string } | null;
  summary: BulkImportSummary;
  tabs: { tab: string; rows: number; valid: number; noPhone: number; placeholder: number; duplicates: number }[];
  rejected: { tab: string; row: number; name: string; reason: string; raw: string }[];
}

/** Admin only: import a CSV file's text or a Google Sheet link (every tab) into the admin's leads. */
export async function adminImport(body: {
  csv?: string;
  fileName?: string;
  sheetUrl?: string;
  label?: string;
  dryRun?: boolean;
}): Promise<BulkImportResponse> {
  const { data } = await apiClient.post<BulkImportResponse>("/leads/admin/import", body, { timeout: 180_000 });
  return data;
}

const LEAD_ADMIN_MOBILE = "8130483894";

/** Mirrors the server: the admin flag, or the leads admin's number. The server enforces it either way. */
export function isLeadAdmin(user: { isAdmin?: boolean; mobileNumber?: string } | null | undefined): boolean {
  if (!user) return false;
  return !!user.isAdmin || (user.mobileNumber ?? "").replace(/\D/g, "").slice(-10) === LEAD_ADMIN_MOBILE;
}

export const isNotInterestedStatus = (status: string) => /not\s*int[e]?rest/i.test(status);
