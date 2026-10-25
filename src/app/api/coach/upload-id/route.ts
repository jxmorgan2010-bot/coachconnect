import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { minorMediaUploadBlockedMessage } from "@/lib/minorConsent";
import { confirmCoachUpload, deleteStoredCoachFile, uploadErrorResponse } from "@/lib/storage";
import { isOwnUploadPathname } from "@/lib/uploadRules";
import { isGovernmentIdType } from "@/lib/coachTypes";
import type { IdDocumentType } from "@/generated/prisma/client";

/**
 * Saves an ID photo the browser has just uploaded to the private store (see lib/storage.ts): a
 * school ID from a student-athlete, or a driver's license, state ID or passport from an
 * experienced coach, who says which.
 */
export async function POST(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { pathname?: unknown; documentType?: unknown } | null;

  // A parent/guardian consents to processing a minor's ID and photos before any upload.
  // If consent was withdrawn mid-upload, discard the file rather than keep it.
  const blockedForMinor = await minorMediaUploadBlockedMessage(profile);
  if (blockedForMinor) {
    if (typeof body?.pathname === "string" && isOwnUploadPathname("id", profile.id, body.pathname)) {
      await deleteStoredCoachFile("id", body.pathname);
    }
    return NextResponse.json({ error: blockedForMinor }, { status: 403 });
  }

  // The type comes from the coach's saved profile, never the request.
  let idDocumentType: IdDocumentType = "SCHOOL_ID";
  if (profile.coachType === "EXPERIENCED") {
    if (!isGovernmentIdType(body?.documentType)) {
      if (typeof body?.pathname === "string" && isOwnUploadPathname("id", profile.id, body.pathname)) {
        await deleteStoredCoachFile("id", body.pathname);
      }
      return NextResponse.json({ error: "Choose which ID this is: driver's license, state ID or passport." }, { status: 400 });
    }
    idDocumentType = body.documentType;
  }

  try {
    const { pathname } = await confirmCoachUpload("id", profile.id, body?.pathname);
    // Re-uploading resets verification back to pending review.
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { idPhotoPath: pathname, idDocumentType, idVerificationStatus: "PENDING" },
    });
    if (profile.idPhotoPath !== pathname) await deleteStoredCoachFile("id", profile.idPhotoPath);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
