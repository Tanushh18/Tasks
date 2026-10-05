import { SharedDocument, type SharedDocumentDocument } from "../models/SharedDocument";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { isDataUrl, removeFile, storeFile } from "./cloudinaryService";

export interface SharedDocumentInput {
  title: string;
  fileData?: string;
  link?: string;
  fileName?: string;
}

export function serializeSharedDocument(d: SharedDocumentDocument) {
  return {
    id: String(d._id),
    title: d.title,
    kind: d.kind,
    url: d.url,
    fileName: d.fileName,
    createdBy: String(d.createdBy),
    createdByName: d.createdByName,
    createdAt: d.createdAt,
  };
}

export async function listSharedDocuments(): Promise<SharedDocumentDocument[]> {
  return SharedDocument.find().sort("-createdAt");
}

export async function createSharedDocument(userId: string, input: SharedDocumentInput): Promise<SharedDocumentDocument> {
  const me = await User.findById(userId).select("name").lean();
  const base = { title: input.title, createdBy: userId, createdByName: me?.name ?? "" };
  if (input.link) {
    return SharedDocument.create({ ...base, kind: "link", url: input.link });
  }
  if (!input.fileData || !isDataUrl(input.fileData)) throw ApiError.badRequest("Add a file or a link");
  const stored = await storeFile(input.fileData, "documents");
  return SharedDocument.create({
    ...base,
    kind: "file",
    url: stored.url,
    publicId: stored.publicId,
    resourceType: stored.resourceType,
    fileName: input.fileName ?? "",
  });
}

export async function deleteSharedDocument(userId: string, isAdmin: boolean, id: string): Promise<void> {
  const doc = await SharedDocument.findById(id);
  if (!doc) throw ApiError.notFound("Document not found");
  if (!isAdmin && String(doc.createdBy) !== String(userId)) {
    throw ApiError.forbidden("Only the person who added this document (or an admin) can delete it");
  }
  await SharedDocument.deleteOne({ _id: doc._id });
  await removeFile(doc.publicId, doc.resourceType as "image" | "raw" | null);
}
