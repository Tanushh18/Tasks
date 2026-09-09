import { DateTime } from "luxon";
import { Location } from "../models/Location";
import { LocationShare } from "../models/LocationShare";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";

interface PingInput {
  lat: number;
  lng: number;
  accuracy?: number;
}

export type ShareDuration = "1h" | "tonight" | "continuous";

/** Not-expired filter reused by every read: null expiresAt means shared continuously. */
const NOT_EXPIRED = { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };

/** Turns a duration option into an absolute expiry, or null for "continuous". */
function computeExpiresAt(duration: ShareDuration | undefined): Date | null {
  if (duration === "1h") return DateTime.now().plus({ hours: 1 }).toJSDate();
  if (duration === "tonight") return DateTime.now().endOf("day").toJSDate();
  return null; // "continuous" or unspecified
}

export async function upsertLocation(userId: string, input: PingInput): Promise<boolean> {
  const hasActiveShare = await LocationShare.exists({ fromUserId: userId, ...NOT_EXPIRED });
  if (!hasActiveShare) return false;

  await Location.findOneAndUpdate(
    { userId },
    { userId, lat: input.lat, lng: input.lng, accuracy: input.accuracy ?? null },
    { upsert: true, new: true }
  );
  return true;
}

export async function startSharing(
  fromUserId: string,
  toUserId: string,
  duration?: ShareDuration
): Promise<void> {
  if (String(fromUserId) === String(toUserId)) {
    throw ApiError.badRequest("You can't share your location with yourself");
  }
  const target = await User.exists({ _id: toUserId });
  if (!target) throw ApiError.notFound("User not found");

  const expiresAt = computeExpiresAt(duration);
  await LocationShare.findOneAndUpdate(
    { fromUserId, toUserId },
    { fromUserId, toUserId, expiresAt },
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
    LocationShare.find({ fromUserId: userId, ...NOT_EXPIRED }).populate<{ toUserId: UserRef }>("toUserId", "name"),
    LocationShare.find({ toUserId: userId, ...NOT_EXPIRED }).populate<{ fromUserId: UserRef }>("fromUserId", "name"),
  ]);

  const sharingWithResult = sharingWith
    .filter((share) => share.toUserId && typeof share.toUserId === "object")
    .map((share) => ({
      id: String((share.toUserId as unknown as UserRef)._id),
      name: (share.toUserId as unknown as UserRef).name,
      expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
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
