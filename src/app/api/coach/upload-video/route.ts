import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { saveIntroVideo } from "@/lib/storage";

const MAX_DURATION_SECONDS = 30;

export async function POST(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const durationRaw = form?.get("durationSeconds");
  const durationSeconds = typeof durationRaw === "string" ? Math.round(Number(durationRaw)) : null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (durationSeconds === null || Number.isNaN(durationSeconds) || durationSeconds <= 0) {
    return NextResponse.json({ error: "Couldn't read video length." }, { status: 400 });
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return NextResponse.json({ error: `Video must be ${MAX_DURATION_SECONDS} seconds or shorter.` }, { status: 400 });
  }

  try {
    const url = await saveIntroVideo(profile.id, file);
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { introVideoUrl: url, introVideoSeconds: durationSeconds },
    });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
