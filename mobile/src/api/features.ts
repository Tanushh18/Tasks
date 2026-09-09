import { apiClient } from "./client";

export interface FeatureFlags {
  contacts: boolean;
  chat: boolean;
  ocr: boolean;
  location: boolean;
  assistant: boolean;
  notes: boolean;
  groupExpenses: boolean;
  documentVault: boolean;
  householdInventory: boolean;
  emergencyInfo: boolean;
  familyEvents: boolean;
  shoppingLists: boolean;
  recurringPayments: boolean;
  familyGoals: boolean;
}

export async function getFeatures(): Promise<FeatureFlags> {
  const { data } = await apiClient.get<{ features: FeatureFlags }>("/features");
  return data.features;
}
