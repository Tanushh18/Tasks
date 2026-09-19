import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { mimeTypeFromDataUrl } from "./filePicker";

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Saves a stored `data:<mime>;base64,...` file to the cache and hands it to the phone's own
 * viewer (PDF reader, Word, Gallery…) through the system "Open with" sheet.
 */
export async function openDataUrlFile(dataUrl: string, fileName?: string | null): Promise<void> {
  try {
    const mimeType = mimeTypeFromDataUrl(dataUrl) ?? "application/octet-stream";
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const ext = EXTENSIONS[mimeType] ?? "bin";
    const safeName = (fileName ?? `document.${ext}`).replace(/[^\w.\- ]+/g, "_");
    const name = safeName.includes(".") ? safeName : `${safeName}.${ext}`;
    const uri = `${FileSystem.cacheDirectory}${Date.now()}-${name}`;

    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Can't open file", "This device has no app that can open this file.");
      return;
    }
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: "Open with" });
  } catch {
    Alert.alert("Couldn't open file", "Please try again.");
  }
}
