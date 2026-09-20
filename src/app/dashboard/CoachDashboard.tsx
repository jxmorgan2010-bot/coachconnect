import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Badge from "@/components/Badge";
import { getBackgroundCheckExpiryState } from "@/lib/coach";
import { formatCents } from "@/lib/money";
import { secondaryButtonClass } from "@/lib/ui";
import { SPORT_LABELS } from "@/lib/sports";
import TrainingPlanChecklist from "@/components/TrainingPlanChecklist";
import { ProgressNoteForm } from "./BookingActions";

export default async function CoachDashboard({ coachProfileId }: { coachProfileId: string }) {
  const profile = await prisma.coachProfile.findUniqueOrThrow({ where: { id: coachProfileId } });
  const expiryState = getBackgroundCheckExpiryState(profile);

  const [upcoming, needingNotes, taughtBookings, trainingPlanItems] = await Promise.all([
    prisma.booking.findMany({
      where: { coachProfileId, status: "CONFIRMED" },
      include: { parentProfile: { include: { user: true } }, child: true },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { coachProfileId, status: "COMPLETED", progressNoteAddedAt: null },
      include: { parentProfile: { include: { user: true } }, child: true },
      orderBy: { completedAt: "desc" },
    }),
    prisma.booking.findMany({
      where: { coachProfileId, status: { in: ["CONFIRMED", "COMPLETED"] }, childId: { not: null } },
      include: { child: true },
      distinct: ["childId", "sport"],
    }),
    prisma.trainingPlanItem.findMany({ where: { coachProfileId }, orderBy: { order: "asc" } }),
  ]);

  const trainingPairs = taughtBookings
    .filter((b) => b.child)
    .map((b) => ({ childId: b.childId!, childName: b.child!.firstName, sport: b.sport }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Your sessions</h1>
        <div className="flex gap-2">
          <Link href="/messages" className={secondaryButtonClass}>Messages</Link>
          <Link href="/dashboard/points" className={secondaryButtonClass}>Points</Link>
          <Link href="/onboarding/coach" className={secondaryButtonClass}>Edit profile</Link>
        </div>
      </div>

      {profile.isSuspended && (
        <div className="mb-6 rounded-xl border-2 border-ink bg-danger/10 p-4 text-sm font-bold text-ink">
          Your profile is paused pending an admin review of recent reports.
        </div>
      )}
      {!profile.isSuspended && expiryState === "RENEWAL_NEEDED" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border-2 border-ink bg-warning/10 p-4">
          <Badge variant="warning">Renewal needed</Badge>
          <span className="text-sm text-ink">
            Your background check expires soon.{" "}
            <Link href="/onboarding/coach" className="font-bold underline">
              Renew it now
            </Link>{" "}
            to stay visible in search.
          </span>
        </div>
      )}
      {!profile.isSuspended && expiryState === "EXPIRED" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border-2 border-ink bg-danger/10 p-4">
          <Badge variant="danger">Expired</Badge>
          <span className="text-sm text-ink">
            Your background check lapsed, so your profile is unpublished.{" "}
            <Link href="/onboarding/coach" className="font-bold underline">
              Renew it
            </Link>{" "}
            to go live again.
          </span>
        </div>
      )}

      {needingNotes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-2xl text-ink">Add a progress note</h2>
          <div className="flex flex-col gap-3">
            {needingNotes.map((b) => (
              <div key={b.id} className="card flex flex-col gap-2 p-4">
                <p className="font-bold text-ink">
                  {b.child?.firstName ?? "Session"} &middot; {b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <p className="text-sm text-muted-foreground">with {b.parentProfile.user.name}</p>
                <ProgressNoteForm bookingId={b.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-2xl text-ink">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">Nothing on the books yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.map((b) => (
              <div key={b.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-ink">
                    {b.child?.firstName ?? "Session"} with {b.parentProfile.user.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {b.scheduledAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} &middot;{" "}
                    {b.durationMinutes} min &middot; {b.locationText}
                  </p>
                  <p className="text-sm font-bold text-pitch">{formatCents(b.priceCents - b.discountCents)}</p>
                  {b.videoCallUrl && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      First session — video call: <code className="text-pitch">{b.videoCallUrl}</code>
                    </p>
                  )}
                </div>
                <div className="text-right text-xs font-bold text-muted-foreground sm:max-w-[10rem]">
                  Payment held. Released once the parent marks this complete (or automatically 48 hours after the
                  session).
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {trainingPairs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-2xl text-ink">Training plans</h2>
          <div className="flex flex-col gap-4">
            {trainingPairs.map((pair) => (
              <div key={`${pair.childId}:${pair.sport}`} className="card p-4">
                <p className="mb-2 font-bold text-ink">{pair.childName} — {SPORT_LABELS[pair.sport]}</p>
                <TrainingPlanChecklist
                  childId={pair.childId}
                  sport={pair.sport}
                  items={trainingPlanItems
                    .filter((i) => i.childId === pair.childId && i.sport === pair.sport)
                    .map((i) => ({ id: i.id, label: i.label, isDone: i.isDone }))}
                  canAdd
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
