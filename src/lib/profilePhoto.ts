import { prisma } from "@/lib/prisma";
import { deleteStoredCoachFile } from "@/lib/storage";

/**
 * Profile photos wait for an admin. A coach's upload is saved as pendingProfilePhotoUrl;
 * profilePhotoUrl (what families and search see) changes only when an admin approves it.
 * Approve and reject name the pending photo the admin looked at, so a photo the coach uploads
 * while the admin is reviewing can't be approved or deleted unseen.
 */

export class PhotoReviewConflict extends Error {
  constructor() {
    super("The coach uploaded a different photo since this page loaded. Refresh to review the new one.");
  }
}

/** Saves a coach's new upload for review and deletes the pending photo it replaces. */
export async function savePendingProfilePhoto(
  profile: { id: string; pendingProfilePhotoUrl: string | null },
  url: string,
): Promise<void> {
  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: { pendingProfilePhotoUrl: url, pendingProfilePhotoAt: new Date(), profilePhotoRejectedAt: null },
  });
  if (profile.pendingProfilePhotoUrl && profile.pendingProfilePhotoUrl !== url) {
    await deleteStoredCoachFile("photo", profile.pendingProfilePhotoUrl);
  }
}

/** Makes the pending photo public and deletes the photo it replaces. */
export async function approvePendingProfilePhoto(coachProfileId: string, expectedUrl: string): Promise<void> {
  const before = await prisma.coachProfile.findUnique({
    where: { id: coachProfileId },
    select: { profilePhotoUrl: true },
  });
  const { count } = await prisma.coachProfile.updateMany({
    where: { id: coachProfileId, pendingProfilePhotoUrl: expectedUrl },
    data: { profilePhotoUrl: expectedUrl, pendingProfilePhotoUrl: null, pendingProfilePhotoAt: null, profilePhotoRejectedAt: null },
  });
  if (count === 0) throw new PhotoReviewConflict();
  if (before?.profilePhotoUrl && before.profilePhotoUrl !== expectedUrl) {
    await deleteStoredCoachFile("photo", before.profilePhotoUrl);
  }
}

/** Discards the pending photo. The coach's current public photo, if any, stays. */
export async function rejectPendingProfilePhoto(coachProfileId: string, expectedUrl: string): Promise<void> {
  const { count } = await prisma.coachProfile.updateMany({
    where: { id: coachProfileId, pendingProfilePhotoUrl: expectedUrl },
    data: { pendingProfilePhotoUrl: null, pendingProfilePhotoAt: null, profilePhotoRejectedAt: new Date() },
  });
  if (count === 0) throw new PhotoReviewConflict();
  await deleteStoredCoachFile("photo", expectedUrl);
}
