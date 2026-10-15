import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { accommodationsSchema } from "@/lib/validation";
import { enforceContactPolicy } from "@/lib/contactPolicy";
import { serializeLanguages } from "@/lib/accommodations";

export async function PATCH(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = accommodationsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { languages, ...rest } = parsed.data;

  // All three free-text fields are shown publicly on the coach's profile.
  const blocked = await enforceContactPolicy({
    userId: profile.userId,
    context: "PROFILE",
    fields: [rest.specialNeedsNote, rest.languagesOther, rest.accommodationsNote],
  });
  if (blocked) return blocked;

  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: { ...rest, languages: serializeLanguages(languages) },
  });

  return NextResponse.json({ ok: true });
}
