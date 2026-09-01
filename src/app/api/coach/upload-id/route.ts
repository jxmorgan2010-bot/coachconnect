import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { saveIdPhoto } from "@/lib/storage";

export async function POST(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  try {
    const filename = await saveIdPhoto(profile.id, file);
    // Re-uploading resets verification back to pending review.
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { idPhotoPath: filename, idVerificationStatus: "PENDING" },
    });
    return NextResponse.json({ ok: true, filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
