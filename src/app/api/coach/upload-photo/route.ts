import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { minorMediaUploadBlockedMessage } from "@/lib/minorConsent";
import { confirmCoachUpload, deleteStoredCoachFile, uploadErrorResponse } from "@/lib/storage";
import { isOwnUploadPathname } from "@/lib/uploadRules";

/** Saves a profile photo the browser has just uploaded to the public store (see lib/storage.ts). */
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
    if (typeof body?.pathname === "string" && isOwnUploadPathname("photo", profile.id, body.pathname)) {
      await deleteStoredCoachFile("photo", body.pathname);
    }
    return NextResponse.json({ error: blockedForMinor }, { status: 403 });
  }

  try {
    const { url } = await confirmCoachUpload("photo", profile.id, body?.pathname);
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { profilePhotoUrl: url },
    });
    if (profile.profilePhotoUrl !== url) await deleteStoredCoachFile("photo", profile.profilePhotoUrl);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
