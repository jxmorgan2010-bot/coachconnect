import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { feedPath } from "@/lib/calendarFeed";
import { createOrResetFeed } from "@/lib/calendarFeedStore";

/**
 * The signed-in parent's or coach's own calendar feed.
 *
 * POST: create the feed, or reset it (a new secret; the old link stops working). The response is
 *   the only time the link exists outside the user's calendar app: only its hash is stored.
 * PATCH (parents): which children the feed includes. null means every child.
 */
async function feedUser() {
  const session = await getCurrentSession();
  const role = session?.user?.role;
  if (!session?.user || (role !== "PARENT" && role !== "COACH")) return null;
  return { id: session.user.id, role };
}

export async function POST() {
  const user = await feedUser();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { token, reset } = await createOrResetFeed(user.id);
  return NextResponse.json({ path: feedPath(token), reset }, { headers: { "Cache-Control": "no-store" } });
}

const childIdsSchema = z.object({
  childIds: z.array(z.string().min(1).max(64)).max(50).nullable(),
});

export async function PATCH(req: Request) {
  const user = await feedUser();
  if (!user || user.role !== "PARENT") return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const parsed = childIdsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose at least one child, or all of them." }, { status: 400 });

  const feed = await prisma.calendarFeed.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!feed) return NextResponse.json({ error: "Make your calendar link first." }, { status: 404 });

  let childIds = parsed.data.childIds;
  if (childIds) {
    const owned = await prisma.child.findMany({
      where: { id: { in: childIds }, parentProfile: { userId: user.id } },
      select: { id: true },
    });
    if (owned.length !== new Set(childIds).size || owned.length === 0) {
      return NextResponse.json({ error: "Choose at least one of your children." }, { status: 400 });
    }
    childIds = owned.map((c) => c.id);
  }

  await prisma.calendarFeed.update({
    where: { id: feed.id },
    data: { childIds: childIds ? JSON.stringify(childIds) : null },
  });
  return NextResponse.json({ ok: true });
}
