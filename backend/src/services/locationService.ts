import { Location } from "../models/Location";
import { LocationShare } from "../models/LocationShare";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";

interface PingInput {
  lat: number;
  lng: number;
  accuracy?: number;
}

export async function upsertLocation(userId: string, input: PingInput): Promise<boolean> {
  const hasActiveShare = await LocationShare.exists({ fromUserId: userId });
  if (!hasActiveShare) return false;

  await Location.findOneAndUpdate(
    { userId },
    { userId, lat: input.lat, lng: input.lng, accuracy: input.accuracy ?? null },
    { upsert: true, new: true }
  );
  return true;
}

export async function startSharing(fromUserId: string, toUserId: string): Promise<void> {
  if (String(fromUserId) === String(toUserId)) {
    throw ApiError.badRequest("You can't share your location with yourself");
  }
  const target = await User.exists({ _id: toUserId });
  if (!target) throw ApiError.notFound("User not found");

  await LocationShare.findOneAndUpdate(
    { fromUserId, toUserId },
    { fromUserId, toUserId },
    { upsert: true, new: true }
  );
}

export async function stopSharing(fromUserId: string, toUserId: string): Promise<void> {
  await LocationShare.deleteOne({ fromUserId, toUserId });
}

interface UserRef {
  _id: unknown;
  name: string;
}

export async function listShares(userId: string) {
  const [sharingWith, sharedWithMe] = await Promise.all([
    LocationShare.find({ fromUserId: userId }).populate<{ toUserId: UserRef }>("toUserId", "name"),
    LocationShare.find({ toUserId: userId }).populate<{ fromUserId: UserRef }>("fromUserId", "name"),
  ]);

  const sharingWithResult = sharingWith
    .filter((share) => share.toUserId && typeof share.toUserId === "object")
    .map((share) => ({
      id: String((share.toUserId as unknown as UserRef)._id),
      name: (share.toUserId as unknown as UserRef).name,
    }));

  const sharedWithMeResult = await Promise.all(
    sharedWithMe
      .filter((share) => share.fromUserId && typeof share.fromUserId === "object")
      .map(async (share) => {
        const from = share.fromUserId as unknown as UserRef;
        const location = await Location.findOne({ userId: from._id });
        return {
          id: String(from._id),
          name: from.name,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          updatedAt: location?.updatedAt ?? null,
        };
      })
  );

  return { sharingWith: sharingWithResult, sharedWithMe: sharedWithMeResult };
}
