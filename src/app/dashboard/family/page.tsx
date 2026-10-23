import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { SPORTS, SPORT_LABELS } from "@/lib/sports";
import Badge from "@/components/Badge";
import DateTile from "@/components/DateTile";
import SportPill from "@/components/SportPill";
import { IconArrowRight } from "@/components/icons";
import { secondaryButtonClass, quietLinkClass } from "@/lib/ui";
import TrainingPlanChecklist from "@/components/TrainingPlanChecklist";
import ParentTabs from "../ParentTabs";
import ChildLevelsCard from "./ChildLevelsCard";
import { formatPacificTime } from "@/lib/sessionTiming";

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
    include: {
      user: { select: { name: true, email: true } },
      children: { orderBy: { createdAt: "asc" }, include: { sportLevels: true } },
    },
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
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
      <p className="eyebrow mb-2 text-pitch">Parent dashboard</p>
      <h1 className="text-display-lg font-display text-ink">Your family</h1>
      <p className="mt-2 mb-6 max-w-2xl text-muted-foreground">
        Every kid, sport, and coach in one view.
      </p>

      <ParentTabs />

      {parentProfile.children.length > 0 && (
        <section aria-labelledby="family-kids" className="mb-10">
          <h2 id="family-kids" className="mb-1 font-display text-3xl text-ink">Kids &amp; levels</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Each coach takes certain levels in each sport. Keep these current so you see coaches who fit.
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {parentProfile.children.map((c) => (
              <ChildLevelsCard
                key={c.id}
                child={{
                  id: c.id,
                  firstName: c.firstName,
                  gradeOrAge: c.gradeOrAge,
                  levels: SPORTS.flatMap((sport) => c.sportLevels.filter((l) => l.sport === sport)).map((l) => ({
                    sport: l.sport,
                    level: l.level,
                  })),
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="family-upcoming" className="mb-10">
        <h2 id="family-upcoming" className="mb-3 font-display text-3xl text-ink">Coming up</h2>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-line p-5">
            <p className="text-muted-foreground">
              {parentProfile.children.length === 0
                ? "No kids or sessions yet. You'll add each kid the first time you book a session for them."
                : "Nothing on the calendar right now."}
            </p>
            <Link href="/coaches" className={secondaryButtonClass}>Find a coach</Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((b) => (
              <li key={b.id} className="card flex gap-4 p-4">
                <DateTile date={b.scheduledAt} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      <SportPill sport={b.sport} />
                      {b.child?.firstName ?? "Session"} with {b.coachProfile.user.name}
                    </p>
                    <Badge variant={STATUS_VARIANT[b.status]}>{formatCents(b.priceCents - b.discountCents)}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {formatPacificTime(b.scheduledAt)} · {b.locationText}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pairKeys.size > 0 && (
        <section aria-labelledby="family-progress">
          <h2 id="family-progress" className="mb-1 font-display text-3xl text-ink">Progress &amp; training plans</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            A session package belongs to one coach and sport, not one kid — any of your kids can use it.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from(pairKeys).map((key) => {
              const [childId, sport] = key.split(":") as [string, keyof typeof SPORT_LABELS];
              const child = parentProfile.children.find((c) => c.id === childId);
              const notes = withNotes.filter((b) => b.childId === childId && b.sport === sport);
              const items = trainingPlanItems.filter((i) => i.childId === childId && i.sport === sport);
              return (
                <div key={key} className="card flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-bold text-ink">
                      <SportPill sport={sport} /> {child?.firstName ?? "Child"} — {SPORT_LABELS[sport]}
                    </p>
                    <Link href={`/dashboard/progress/${childId}/${sport}`} className={`${quietLinkClass} text-pitch`}>
                      Full history <IconArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  {notes[0] && (
                    <p className="border-l-4 border-gold pl-3 text-sm text-muted-foreground">
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

      {/* Read-only for now: changing name or email touches sign-in, which is a separate change. */}
      <section aria-labelledby="family-account" className="mt-10 rounded-xl border-2 border-ink bg-surface p-4 sm:p-5">
        <h2 id="family-account" className="mb-3 font-display text-3xl text-ink">Account</h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="eyebrow text-muted-foreground">Name</dt>
          <dd className="font-bold text-ink">{parentProfile.user.name}</dd>
          <dt className="eyebrow text-muted-foreground">Email</dt>
          <dd className="break-all font-bold text-ink">{parentProfile.user.email}</dd>
          <dt className="eyebrow text-muted-foreground">Phone</dt>
          <dd className={parentProfile.phone ? "font-bold text-ink" : "text-muted-foreground"}>
            {parentProfile.phone ?? "Not added"}
          </dd>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          To change any of these, send us a note with the help button in the bottom corner.
        </p>
      </section>
    </div>
  );
}
