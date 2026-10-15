import { NextResponse } from "next/server";
import { requireCoachProfile } from "@/lib/session";
import { minorMediaUploadBlockedMessage } from "@/lib/minorConsent";
import { confirmCoachUpload, deleteStoredCoachFile, uploadErrorResponse } from "@/lib/storage";
import { isOwnUploadPathname } from "@/lib/uploadRules";
import { savePendingProfilePhoto } from "@/lib/profilePhoto";

/**
 * Saves a profile photo the browser has just uploaded to the public store (see lib/storage.ts).
 * It waits for an admin to approve it; the current public photo stays until then (lib/profilePhoto.ts).
 */
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
    await savePendingProfilePhoto(profile, url);
    return NextResponse.json({ ok: true, url, pending: true });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
