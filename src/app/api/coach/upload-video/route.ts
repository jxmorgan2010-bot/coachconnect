import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { minorMediaUploadBlockedMessage } from "@/lib/minorConsent";
import { BIO_VIDEO_UPLOADS_ENABLED, BIO_VIDEO_PAUSED_MESSAGE } from "@/lib/features";
import { confirmCoachUpload, deleteStoredCoachFile, uploadErrorResponse } from "@/lib/storage";
import { MAX_CLIP_SECONDS, isBioVideoClipType, isOwnUploadPathname, type BioVideoClipType } from "@/lib/uploadRules";

const CLIP_FIELDS: Record<BioVideoClipType, { urlField: "introClipUrl" | "coachingClipUrl" | "playingClipUrl"; secondsField: "introClipSeconds" | "coachingClipSeconds" | "playingClipSeconds" }> = {
  intro: { urlField: "introClipUrl", secondsField: "introClipSeconds" },
  coaching: { urlField: "coachingClipUrl", secondsField: "coachingClipSeconds" },
  playing: { urlField: "playingClipUrl", secondsField: "playingClipSeconds" },
};

/** Saves one bio video clip the browser has just uploaded to the public store (see lib/storage.ts). */
export async function POST(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { pathname?: unknown; clipType?: unknown; durationSeconds?: unknown }
    | null;
  const discardUpload = async () => {
    if (typeof body?.pathname === "string" && isOwnUploadPathname("video", profile.id, body.pathname)) {
      await deleteStoredCoachFile("video", body.pathname);
    }
  };

  if (!BIO_VIDEO_UPLOADS_ENABLED) {
    await discardUpload();
    return NextResponse.json({ error: BIO_VIDEO_PAUSED_MESSAGE }, { status: 403 });
  }

  // A parent/guardian consents to processing a minor's ID and photos before any upload.
  const blockedForMinor = await minorMediaUploadBlockedMessage(profile);
  if (blockedForMinor) {
    await discardUpload();
    return NextResponse.json({ error: blockedForMinor }, { status: 403 });
  }

  const durationSeconds = typeof body?.durationSeconds === "number" ? Math.round(body.durationSeconds) : null;

  if (!isBioVideoClipType(body?.clipType)) {
    await discardUpload();
    return NextResponse.json({ error: "Invalid clip type." }, { status: 400 });
  }
  const clipType = body.clipType;

  if (durationSeconds === null || Number.isNaN(durationSeconds) || durationSeconds <= 0) {
    await discardUpload();
    return NextResponse.json({ error: "Couldn't read video length." }, { status: 400 });
  }
  if (durationSeconds > MAX_CLIP_SECONDS) {
    await discardUpload();
    return NextResponse.json({ error: `Each clip must be ${MAX_CLIP_SECONDS} seconds or shorter.` }, { status: 400 });
  }

  try {
    const { url } = await confirmCoachUpload("video", profile.id, body.pathname);
    const { urlField, secondsField } = CLIP_FIELDS[clipType];
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { [urlField]: url, [secondsField]: durationSeconds },
    });
    if (profile[urlField] !== url) await deleteStoredCoachFile("video", profile[urlField]);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
