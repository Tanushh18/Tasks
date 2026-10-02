import { Alert } from "react-native";
import { getApiErrorMessage } from "../api/client";
import * as api from "../api/leads";
import { pickCsvFile } from "../utils/filePicker";
import { emitLeadEvent } from "./leadEvents";

function describe(s: api.BulkImportSummary, dryRun: boolean): string {
  const lines = [
    `${s.added} new lead${s.added === 1 ? "" : "s"}${dryRun ? " will be added" : " added"}`,
    s.updated ? `${s.updated} already in your leads (blank details filled in)` : "",
    s.noValidMobile ? `${s.noValidMobile} rows skipped: no valid mobile number` : "",
    s.placeholders ? `${s.placeholders} empty/placeholder rows skipped` : "",
    s.duplicateRows ? `${s.duplicateRows} duplicate rows merged` : "",
    s.sharedWithYouAlready ? `${s.sharedWithYouAlready} already in a list shared with you` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Admin only: pick a CSV, preview what it will do, then import it. The server does the cleaning
 * (any column order, several numbers per cell, duplicates, rows without a mobile).
 */
export async function runAdminCsvImport(setBusy?: (busy: boolean) => void): Promise<void> {
  const file = await pickCsvFile();
  if (!file) return;
  setBusy?.(true);
  try {
    const preview = await api.adminImport({ csv: file.text, fileName: file.fileName, dryRun: true });
    setBusy?.(false);
    if (!preview.summary.added && !preview.summary.updated) {
      Alert.alert("Nothing to import", `${describe(preview.summary, true)}\n\nThe file needs a name column and a mobile/phone column.`);
      return;
    }
    Alert.alert(`Import ${file.fileName}?`, describe(preview.summary, true), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Import",
        onPress: async () => {
          setBusy?.(true);
          try {
            const done = await api.adminImport({ csv: file.text, fileName: file.fileName });
            emitLeadEvent("leadsChanged");
            Alert.alert("Import finished", describe(done.summary, false));
          } catch (e) {
            Alert.alert("Import failed", getApiErrorMessage(e));
          } finally {
            setBusy?.(false);
          }
        },
      },
    ]);
  } catch (e) {
    setBusy?.(false);
    Alert.alert("Couldn't read that file", getApiErrorMessage(e));
  }
}
