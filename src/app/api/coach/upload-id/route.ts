import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { minorMediaUploadBlockedMessage } from "@/lib/minorConsent";
import { confirmCoachUpload, deleteStoredCoachFile, uploadErrorResponse } from "@/lib/storage";
import { isOwnUploadPathname } from "@/lib/uploadRules";

/** Saves a school ID photo the browser has just uploaded to the private store (see lib/storage.ts). */
export async function POST(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { pathname?: unknown } | null;

  // A parent/guardian consents to processing a minor's ID and photos before any upload.
  // If consent was withdrawn mid-upload, discard the file rather than keep it.
  const blockedForMinor = await minorMediaUploadBlockedMessage(profile);
  if (blockedForMinor) {
    if (typeof body?.pathname === "string" && isOwnUploadPathname("id", profile.id, body.pathname)) {
      await deleteStoredCoachFile("id", body.pathname);
    }
    return NextResponse.json({ error: blockedForMinor }, { status: 403 });
  }

  try {
    const { pathname } = await confirmCoachUpload("id", profile.id, body?.pathname);
    // Re-uploading resets verification back to pending review.
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { idPhotoPath: pathname, idVerificationStatus: "PENDING" },
    });
    if (profile.idPhotoPath !== pathname) await deleteStoredCoachFile("id", profile.idPhotoPath);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
