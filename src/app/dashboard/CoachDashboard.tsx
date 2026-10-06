import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Badge from "@/components/Badge";
import { getBackgroundCheckExpiryState, isCoachLive } from "@/lib/coach";
import { formatCents, AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";
import DateTile from "@/components/DateTile";
import SportPill from "@/components/SportPill";
import { IconMessage } from "@/components/icons";
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

  // Derived from the bookings already loaded — past CONFIRMED sessions are waiting on the parent.
  const now = new Date();
  const comingUp = upcoming.filter((b) => b.scheduledAt >= now);
  const awaitingParent = upcoming.filter((b) => b.scheduledAt < now);
  const live = isCoachLive(profile);

  // What the coach should expect for payment, from the booking's actual payment state.
  function paymentNote(b: (typeof upcoming)[number]) {
    if (b.packageId) return "Prepaid package session.";
    if (b.paymentStatus === "AUTHORIZED") {
      return `Card held. Paid out when the parent marks it complete, or automatically ${AUTO_RELEASE_GRACE_HOURS} hours after the session.`;
    }
    return "No card hold on this session.";
  }

  function SessionCard({ b, waiting = false }: { b: (typeof upcoming)[number]; waiting?: boolean }) {
    return (
      <li className={`${waiting ? "card-flat" : "card"} flex gap-4 p-4`}>
        <DateTile date={b.scheduledAt} muted={waiting} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
              <SportPill sport={b.sport} />
              {b.child?.firstName ?? "Session"}
              <span className="font-normal text-muted-foreground">· {b.parentProfile.user.name}&apos;s family</span>
            </p>
            <span className="font-display text-lg leading-none text-pitch">{formatCents(b.priceCents - b.discountCents)}</span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {b.scheduledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {b.durationMinutes} min ·{" "}
            {b.locationText}
          </p>
          <p className="mt-1.5 text-xs font-bold text-muted-foreground">
            {waiting ? "Waiting for the parent to mark this complete. " : ""}
            {paymentNote(b)}
          </p>
          {b.videoCallUrl && !waiting && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              First session — video call: <code className="break-all text-pitch">{b.videoCallUrl}</code>
            </p>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2 text-pitch">
            Coach dashboard
            {live ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Not live</Badge>}
          </p>
          <h1 className="text-display-lg font-display text-ink">Your sessions</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/messages" className={secondaryButtonClass}>
            <IconMessage className="h-4 w-4" /> Messages
          </Link>
          <Link href="/dashboard/points" className={secondaryButtonClass}>Points</Link>
          <Link href={`/coaches/${profile.id}`} className={secondaryButtonClass}>Public profile</Link>
          <Link href="/onboarding/coach" className={secondaryButtonClass}>Edit profile</Link>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {profile.isSuspended && (
          <div className="rounded-xl border-2 border-ink bg-danger/10 p-4 text-sm font-bold text-ink">
            Your profile is paused pending an admin review of recent reports.
          </div>
        )}
        {!profile.isSuspended && expiryState === "RENEWAL_NEEDED" && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-warning/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="warning">Renewal needed</Badge>
            <span className="text-sm text-ink">
              Your yearly background check step is due soon.{" "}
              <Link href="/onboarding/coach#background-check" className="font-bold underline">
                Renew it now
              </Link>{" "}
              to stay visible in search.
            </span>
          </div>
        )}
        {!profile.isSuspended && expiryState === "EXPIRED" && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-danger/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="danger">Lapsed</Badge>
            <span className="text-sm text-ink">
              Your yearly background check step lapsed, so your profile is unpublished.{" "}
              <Link href="/onboarding/coach#background-check" className="font-bold underline">
                Renew it
              </Link>{" "}
              to go live again.
            </span>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="coming-up">
            <h2 id="coming-up" className="mb-3 font-display text-3xl text-ink">Coming up</h2>
            {comingUp.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-line p-5">
                <p className="text-muted-foreground">
                  {live
                    ? "No sessions booked yet. Families can find you in search now — keeping your availability and bio up to date helps."
                    : "No sessions booked yet. Families can find you once your profile is live."}
                </p>
                <Link href={`/coaches/${profile.id}`} className={secondaryButtonClass}>See your public profile</Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {comingUp.map((b) => (
                  <SessionCard key={b.id} b={b} />
                ))}
              </ul>
            )}
          </section>

          {awaitingParent.length > 0 && (
            <section aria-labelledby="awaiting">
              <h2 id="awaiting" className="mb-1 font-display text-3xl text-ink">Waiting on the parent</h2>
              <p className="mb-3 text-sm text-muted-foreground">These sessions have passed but haven&apos;t been marked complete yet.</p>
              <ul className="flex flex-col gap-3">
                {awaitingParent.map((b) => (
                  <SessionCard key={b.id} b={b} waiting />
                ))}
              </ul>
            </section>
          )}

          {trainingPairs.length > 0 && (
            <section aria-labelledby="plans">
              <h2 id="plans" className="mb-3 font-display text-3xl text-ink">Training plans</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {trainingPairs.map((pair) => (
                  <div key={`${pair.childId}:${pair.sport}`} className="card flex flex-col gap-3 p-4">
                    <p className="flex items-center gap-2 font-bold text-ink">
                      <SportPill sport={pair.sport} /> {pair.childName} — {SPORT_LABELS[pair.sport]}
                    </p>
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

        <aside aria-labelledby="notes" className="flex flex-col gap-3">
          <h2 id="notes" className="font-display text-3xl text-ink">Progress notes to write</h2>
          {needingNotes.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
              You&apos;re all caught up. After a completed session, add a quick note here so the family sees what you
              worked on.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {needingNotes.map((b) => (
                <li key={b.id} className="card flex flex-col gap-3 p-4">
                  <div>
                    <p className="flex items-center gap-2 font-bold text-ink">
                      <SportPill sport={b.sport} /> {b.child?.firstName ?? "Session"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
                      {b.parentProfile.user.name}&apos;s family
                    </p>
                  </div>
                  <ProgressNoteForm bookingId={b.id} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
