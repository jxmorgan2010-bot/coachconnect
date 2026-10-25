import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { parentCancelSchema } from "@/lib/validation";
import { cancelByParent } from "@/lib/bookingCancellation";

/**
 * Parent cancels an upcoming session. Free until 11:59 PM Pacific the night before (hold
 * released, or the session goes back into their package); after that the full price is
 * charged. See src/lib/cancellation.ts for the rules and src/lib/bookingCancellation.ts
 * for what happens to the money.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parentCancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Review what cancelling means for this session, then confirm." }, { status: 400 });
  }

  const { id } = await params;
  const result = await cancelByParent({ bookingId: id, parentUserId: session.user.id, expected: parsed.data.expected });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code, outcome: result.outcome }, { status: result.status });
  }
  return NextResponse.json({ ok: true, outcome: result.outcome, stripeOk: result.stripeOk });
}
