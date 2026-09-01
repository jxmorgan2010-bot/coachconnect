import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { progressNoteSchema } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const coachProfile = await requireCoachProfile();
  if (!coachProfile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.coachProfileId !== coachProfile.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "COMPLETED") {
    return NextResponse.json({ error: "Mark the session complete first." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = progressNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      progressWhatWorkedOn: parsed.data.whatWorkedOn,
      progressNextFocus: parsed.data.nextFocus || null,
      progressNoteAddedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, booking: updated });
}
