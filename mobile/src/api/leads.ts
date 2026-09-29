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
}

export async function listLeads(search?: string, archived = false): Promise<Lead[]> {
  const { data } = await apiClient.get<{ leads: Lead[] }>("/leads", {
    params: { search: search || undefined, archived: archived || undefined },
  });
  return data.leads;
}

export async function updateLead(id: string, body: Partial<Lead>): Promise<Lead> {
  const { data } = await apiClient.patch<{ lead: Lead }>(`/leads/${id}`, body);
  return data.lead;
}

export async function listSources(): Promise<LeadSource[]> {
  const { data } = await apiClient.get<{ sources: LeadSource[] }>("/leads/sources/list");
  return data.sources;
}

export async function addSource(url: string, label = ""): Promise<any> {
  const { data } = await apiClient.post<{ source: LeadSource; result: any }>(
    "/leads/sources",
    { url, label }
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
