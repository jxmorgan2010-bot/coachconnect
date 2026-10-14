import { NextResponse } from "next/server";
import { requireCoachProfile } from "@/lib/session";
import { minorMediaUploadBlockedMessage } from "@/lib/minorConsent";
import { BIO_VIDEO_UPLOADS_ENABLED, BIO_VIDEO_PAUSED_MESSAGE } from "@/lib/features";
import { isBioVideoClipType, isUploadKind } from "@/lib/uploadRules";
import { createCoachUploadToken, uploadErrorResponse } from "@/lib/storage";

/**
 * Issues a short-lived token for the browser to upload one file straight to storage. The
 * server picks the pathname (inside the coach's own folder), and the token only allows that
 * pathname, the declared content type and the size limit for this kind of file.
 */
export async function POST(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  // A parent/guardian consents to processing a minor's ID and photos before any upload.
  const blockedForMinor = await minorMediaUploadBlockedMessage(profile);
  if (blockedForMinor) {
    return NextResponse.json({ error: blockedForMinor }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind;
  const contentType = body?.contentType;
  const size = body?.size;
  if (!isUploadKind(kind) || typeof contentType !== "string" || typeof size !== "number" || !(size > 0)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  let clipType;
  if (kind === "video") {
    if (!BIO_VIDEO_UPLOADS_ENABLED) {
      return NextResponse.json({ error: BIO_VIDEO_PAUSED_MESSAGE }, { status: 403 });
    }
    if (!isBioVideoClipType(body?.clipType)) {
      return NextResponse.json({ error: "Invalid clip type." }, { status: 400 });
    }
    clipType = body.clipType;
  }

  try {
    const token = await createCoachUploadToken(kind, profile.id, { type: contentType, size }, clipType);
    return NextResponse.json(token);
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
