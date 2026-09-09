import { EmergencyInfo, type EmergencyInfoDocument } from "../models/EmergencyInfo";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";

export interface EmergencyContactInput {
  name: string;
  phone: string;
  relation?: string;
}

export interface EmergencyInfoInput {
  emergencyContacts?: EmergencyContactInput[];
  medicalNotes?: string;
  homeInfo?: string;
}

// Emergency info is deliberately visible to every registered user (not scoped to
// "owner only" or a sharedWith list like the other two modules): the entire point
// of this feature is that someone OTHER than the owner — a family member, in a
// genuine emergency — can look up medical/contact/home details quickly. This is a
// small family app where every registered user is presumed to be family, so we
// treat "visible to all authenticated users" as the reasonable default rather than
// adding a separate family-membership concept just for this feature.
export async function getOwnInfo(userId: string): Promise<EmergencyInfoDocument | null> {
  return EmergencyInfo.findOne({ ownerId: userId });
}

export async function getInfoForUser(userId: string): Promise<EmergencyInfoDocument | null> {
  const user = await User.findById(userId).select("_id");
  if (!user) throw ApiError.notFound("User not found");
  return EmergencyInfo.findOne({ ownerId: userId });
}

export async function upsertOwnInfo(userId: string, input: EmergencyInfoInput): Promise<EmergencyInfoDocument> {
  const update: Partial<EmergencyInfoInput> = {};
  if (input.emergencyContacts !== undefined) update.emergencyContacts = input.emergencyContacts;
  if (input.medicalNotes !== undefined) update.medicalNotes = input.medicalNotes;
  if (input.homeInfo !== undefined) update.homeInfo = input.homeInfo;

  const info = await EmergencyInfo.findOneAndUpdate(
    { ownerId: userId },
    { $set: update, $setOnInsert: { ownerId: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return info as EmergencyInfoDocument;
}
