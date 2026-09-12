import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { saveBioVideoClip, BIO_VIDEO_CLIP_TYPES, type BioVideoClipType } from "@/lib/storage";

const MAX_DURATION_SECONDS = 60;

const CLIP_FIELDS: Record<BioVideoClipType, { urlField: "introClipUrl" | "coachingClipUrl" | "playingClipUrl"; secondsField: "introClipSeconds" | "coachingClipSeconds" | "playingClipSeconds" }> = {
  intro: { urlField: "introClipUrl", secondsField: "introClipSeconds" },
  coaching: { urlField: "coachingClipUrl", secondsField: "coachingClipSeconds" },
  playing: { urlField: "playingClipUrl", secondsField: "playingClipSeconds" },
};

export async function POST(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const clipTypeRaw = form?.get("clipType");
  const durationRaw = form?.get("durationSeconds");
  const durationSeconds = typeof durationRaw === "string" ? Math.round(Number(durationRaw)) : null;

  if (typeof clipTypeRaw !== "string" || !BIO_VIDEO_CLIP_TYPES.includes(clipTypeRaw as BioVideoClipType)) {
    return NextResponse.json({ error: "Invalid clip type." }, { status: 400 });
  }
  const clipType = clipTypeRaw as BioVideoClipType;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (durationSeconds === null || Number.isNaN(durationSeconds) || durationSeconds <= 0) {
    return NextResponse.json({ error: "Couldn't read video length." }, { status: 400 });
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return NextResponse.json({ error: `Each clip must be ${MAX_DURATION_SECONDS} seconds or shorter.` }, { status: 400 });
  }

  try {
    const url = await saveBioVideoClip(profile.id, clipType, file);
    const { urlField, secondsField } = CLIP_FIELDS[clipType];
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { [urlField]: url, [secondsField]: durationSeconds },
    });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
