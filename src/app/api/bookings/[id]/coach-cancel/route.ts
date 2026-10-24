import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { cancelByCoach } from "@/lib/bookingCancellation";

/**
 * Coach cancels one of their sessions, any time before it ends. The parent is never
 * charged: the hold is released, or the session goes back into their package.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const result = await cancelByCoach({ bookingId: id, coachUserId: session.user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, stripeOk: result.stripeOk });
}
