import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

export interface PickedFile {
  dataUrl: string;
  fileName: string;
  mimeType: string;
}

const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Launches the camera or photo library and returns a base64 data URL, or null if cancelled. */
export async function pickImage(source: "camera" | "library"): Promise<PickedFile | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Permission needed", "Please allow access so we can add this file.");
    return null;
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.7 });

  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const asset = result.assets[0];
  return {
    dataUrl: `data:image/jpeg;base64,${asset.base64}`,
    fileName: asset.fileName ?? "photo.jpg",
    mimeType: "image/jpeg",
  };
}

/** Launches the document picker for PDF/Word files and returns a base64 data URL, or null if cancelled. */
export async function pickDocumentFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: DOCUMENT_MIME_TYPES,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? "application/pdf";

  try {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      fileName: asset.name ?? "document",
      mimeType,
    };
  } catch {
    Alert.alert("Couldn't read file", "Please try a different file.");
    return null;
  }
}

/** Human label for a mime type, used when no filename is available. */
export function labelForMimeType(mimeType: string | null): string {
  if (!mimeType) return "File";
  if (mimeType.startsWith("image/")) return "Photo";
  if (mimeType === "application/pdf") return "PDF document";
  if (mimeType === "application/msword" || mimeType.includes("wordprocessingml")) return "Word document";
  return "File";
}

/** Extracts the mime type from a `data:<mime>;base64,...` URL, or null if it can't be parsed. */
export function mimeTypeFromDataUrl(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  const match = /^data:([^;]+);base64,/.exec(dataUrl);
  return match ? match[1] : null;
}

export type FilePickerSource = "camera" | "library" | "document";

/** Shows the standard 3-way "attach a file" action sheet (camera / photo library / PDF or Word). */
export function showFilePickerSheet(onPick: (source: FilePickerSource) => void, title = "Attach file") {
  Alert.alert(title, "Choose a source.", [
    { text: "Take Photo", onPress: () => onPick("camera") },
    { text: "Choose from Library", onPress: () => onPick("library") },
    { text: "Choose PDF or Word document", onPress: () => onPick("document") },
    { text: "Cancel", style: "cancel" },
  ]);
}
