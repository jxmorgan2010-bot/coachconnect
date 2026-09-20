import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { SPORT_LABELS } from "@/lib/sports";
import Badge from "@/components/Badge";
import TrainingPlanChecklist from "@/components/TrainingPlanChecklist";
import ParentTabs from "../ParentTabs";

const STATUS_VARIANT = {
  PENDING_CONSENT: "warning",
  CONFIRMED: "accent",
  COMPLETED: "success",
  CANCELLED: "neutral",
} as const;

export default async function FamilyDashboardPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/family");
  if (session.user.role !== "PARENT") redirect("/dashboard");

  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { children: { orderBy: { createdAt: "asc" } } },
  });
  if (!parentProfile) redirect("/dashboard");

  const [upcoming, withNotes, trainingPlanItems] = await Promise.all([
    prisma.booking.findMany({
      where: { parentProfileId: parentProfile.id, status: "CONFIRMED" },
      include: { coachProfile: { include: { user: true } }, child: true },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { parentProfileId: parentProfile.id, status: "COMPLETED", progressNoteAddedAt: { not: null } },
      include: { coachProfile: { include: { user: true } }, child: true },
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.trainingPlanItem.findMany({
      where: { child: { parentProfileId: parentProfile.id } },
      orderBy: { order: "asc" },
    }),
  ]);

  // (childId, sport) pairs across every child, whichever coach taught them — the whole
  // point of this view is collapsing per-booking pages into one cross-kid, cross-sport look.
  const pairKeys = new Set<string>();
  for (const b of [...upcoming, ...withNotes]) {
    if (b.childId) pairKeys.add(`${b.childId}:${b.sport}`);
  }
  for (const item of trainingPlanItems) pairKeys.add(`${item.childId}:${item.sport}`);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl text-ink">Family dashboard</h1>
      <p className="mb-6 text-muted-foreground">
        {parentProfile.children.length} kid{parentProfile.children.length === 1 ? "" : "s"} across every sport and coach, in one view.
        Note: a session package is tied to one coach and sport, not a specific child — any of your kids can use it.
      </p>

      <ParentTabs />

      <section className="mb-8">
        <h2 className="mb-3 font-display text-2xl text-ink">Upcoming across the family</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">Nothing on the books yet.</p>
        ) : (
          <div className="flex flex-col divide-y-2 divide-line rounded-lg border-2 border-ink">
            {upcoming.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-bold text-ink">
                    {b.child?.firstName ?? "Session"} — {SPORT_LABELS[b.sport]} with {b.coachProfile.user.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {b.scheduledAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} &middot;{" "}
                    {b.locationText}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[b.status]}>{formatCents(b.priceCents - b.discountCents)}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {pairKeys.size > 0 && (
        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">Progress &amp; training plans</h2>
          <div className="flex flex-col gap-4">
            {Array.from(pairKeys).map((key) => {
              const [childId, sport] = key.split(":") as [string, keyof typeof SPORT_LABELS];
              const child = parentProfile.children.find((c) => c.id === childId);
              const notes = withNotes.filter((b) => b.childId === childId && b.sport === sport);
              const items = trainingPlanItems.filter((i) => i.childId === childId && i.sport === sport);
              return (
                <div key={key} className="card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-bold text-ink">{child?.firstName ?? "Child"} — {SPORT_LABELS[sport]}</p>
                    <Link href={`/dashboard/progress/${childId}/${sport}`} className="text-xs font-bold text-pitch underline">
                      Full history
                    </Link>
                  </div>
                  {notes[0] && (
                    <p className="mb-3 text-sm text-muted-foreground">
                      <span className="font-bold text-ink">Latest: </span>
                      {notes[0].progressWhatWorkedOn}
                    </p>
                  )}
                  <TrainingPlanChecklist
                    childId={childId}
                    sport={sport}
                    items={items.map((i) => ({ id: i.id, label: i.label, isDone: i.isDone }))}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
