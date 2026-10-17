import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { countUnread } from "@/lib/unreadMessages";

// Polled by the navbar every 30 seconds. Only parents and coaches have conversations, so
// everyone else (signed out, admins) simply gets zeros rather than an error.
export async function GET() {
  const session = await getCurrentSession();
  const role = session?.user?.role;
  if (!session?.user || (role !== "PARENT" && role !== "COACH")) {
    return NextResponse.json({ threads: 0, messages: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const counts = await countUnread(session.user.id);
  return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
}
