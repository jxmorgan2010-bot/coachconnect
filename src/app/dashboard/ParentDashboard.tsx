import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { primaryButtonClass, secondaryButtonClass, goldButtonClass, quietLinkClass } from "@/lib/ui";
import { formatCents } from "@/lib/money";
import { SPORT_LABELS } from "@/lib/sports";
import { REFERRAL_BONUS_CENTS } from "@/lib/referral";
import type { Sport } from "@/generated/prisma/client";
import DateTile from "@/components/DateTile";
import SportPill from "@/components/SportPill";
import { IconArrowRight, IconMessage } from "@/components/icons";
import ReferralPanel from "./ReferralPanel";
import RatingForm from "./RatingForm";
import ParentTabs from "./ParentTabs";
import { MarkCompleteButton } from "./BookingActions";

export default async function ParentDashboard({ userId, name }: { userId: string; name: string }) {
  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId },
    include: { children: { orderBy: { createdAt: "asc" } } },
  });
  if (!parentProfile) return null;

  const [bookings, packages] = await Promise.all([
    prisma.booking.findMany({
      where: { parentProfileId: parentProfile.id },
      include: {
        coachProfile: { include: { user: true } },
        child: true,
        review: true,
        dispute: true,
      },
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.sessionPackage.findMany({
      where: { parentProfileId: parentProfile.id, status: "ACTIVE" },
      include: { coachProfile: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const needingRating = bookings.filter((b) => b.status === "COMPLETED" && !b.review);
  const withNotes = bookings.filter((b) => b.status === "COMPLETED" && b.progressNoteAddedAt);

  // Grouped by child *and* sport — a kid playing two sports with the same or different
  // coaches gets separate progress sections for each.
  const notesByChildSport = new Map<string, { childName: string; sport: Sport; entries: typeof withNotes }>();
  for (const b of withNotes) {
    const key = `${b.childId ?? "unknown"}:${b.sport}`;
    const childName = b.child?.firstName ?? "Your child";
    if (!notesByChildSport.has(key)) notesByChildSport.set(key, { childName, sport: b.sport, entries: [] });
    notesByChildSport.get(key)!.entries.push(b);
  }

  // Derived from the bookings already loaded above — no extra queries.
  const now = new Date();
  const upcoming = bookings
    .filter((b) => b.status === "CONFIRMED" && b.scheduledAt >= now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const nextUp = upcoming[0];
  const awaitingComplete = bookings.filter((b) => b.status === "CONFIRMED" && b.scheduledAt < now);
  const firstName = name.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2 text-pitch">Parent dashboard</p>
          <h1 className="text-display-lg font-display text-ink">Welcome, {firstName}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/coaches" className={primaryButtonClass}>Find a coach</Link>
          <Link href="/messages" className={secondaryButtonClass}>
            <IconMessage className="h-4 w-4" /> Messages
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <ParentTabs />
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        {bookings.length === 0 ? (
          // First visit: nothing booked yet (packages and referral still show alongside)
          <div className="card-flat flex flex-col items-start gap-4 self-start p-6 sm:p-8">
            <h2 className="text-display-md font-display text-ink">No sessions booked yet</h2>
            <p className="max-w-lg text-muted-foreground">
              Find a coach for your kid&apos;s sport, pick a time and a public place, and book. Your upcoming
              sessions, progress notes, and reviews will show up here.
            </p>
            <Link href="/coaches" className={goldButtonClass}>
              See coaches near you <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-10">
            <section aria-labelledby="next-up">
              <h2 id="next-up" className="mb-3 font-display text-3xl text-ink">Next up</h2>
              {nextUp ? (
                <div className="card flex gap-4 p-4 sm:p-5">
                  <DateTile date={nextUp.scheduledAt} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SportPill sport={nextUp.sport} />
                      <p className="font-bold text-ink">{nextUp.child?.firstName ?? "Session"} with {nextUp.coachProfile.user.name}</p>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {nextUp.scheduledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ·{" "}
                      {nextUp.durationMinutes} min · {nextUp.locationText}
                    </p>
                    {upcoming.length > 1 && (
                      <Link href="/dashboard/bookings" className={`${quietLinkClass} text-pitch`}>
                        +{upcoming.length - 1} more upcoming <IconArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-line p-5">
                  <p className="text-muted-foreground">Nothing on the calendar right now.</p>
                  <Link href="/coaches" className={secondaryButtonClass}>Book a session</Link>
                </div>
              )}
            </section>

            {(awaitingComplete.length > 0 || needingRating.length > 0) && (
              <section aria-labelledby="needs-you" className="flex flex-col gap-4">
                <h2 id="needs-you" className="font-display text-3xl text-ink">Needs you</h2>

                {awaitingComplete.map((b) => (
                  <div key={b.id} className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-ink">Did this session happen?</p>
                      <p className="text-sm text-muted-foreground">
                        {b.child?.firstName ?? "Session"} with {b.coachProfile.user.name} ·{" "}
                        {b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Marking it
                        complete pays the coach.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <MarkCompleteButton bookingId={b.id} />
                      <Link href="/dashboard/bookings" className={`${quietLinkClass} text-ink`}>
                        Report a problem
                      </Link>
                    </div>
                  </div>
                ))}

                {needingRating.map((b) => (
                  <RatingForm key={b.id} bookingId={b.id} coachName={b.coachProfile.user.name} />
                ))}
              </section>
            )}

            {notesByChildSport.size > 0 && (
              <section aria-labelledby="progress">
                <h2 id="progress" className="mb-3 font-display text-3xl text-ink">Progress notes</h2>
                <div className="flex flex-col gap-6">
                  {Array.from(notesByChildSport.entries()).map(([key, { childName, sport, entries }]) => (
                    <div key={key}>
                      <p className="mb-2 flex items-center gap-2 font-bold text-ink">
                        <SportPill sport={sport} /> {childName} — {SPORT_LABELS[sport]}
                      </p>
                      <ol className="flex flex-col gap-3 border-l-4 border-gold pl-4">
                        {entries.map((b) => (
                          <li key={b.id}>
                            <p className="text-xs font-bold text-muted-foreground">
                              {b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} with {b.coachProfile.user.name}
                            </p>
                            <p className="mt-0.5 text-sm text-ink">
                              <span className="font-bold">Worked on: </span>
                              {b.progressWhatWorkedOn}
                            </p>
                            {b.progressNextFocus && (
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                <span className="font-bold">Next focus: </span>
                                {b.progressNextFocus}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <aside className="flex flex-col gap-6">
            {packages.length > 0 && (
              <section aria-labelledby="packages">
                <h2 id="packages" className="mb-3 font-display text-2xl text-ink">Your packages</h2>
                <div className="flex flex-col gap-3">
                  {packages.map((pkg) => {
                    const left = pkg.totalSessions - pkg.sessionsUsed;
                    return (
                      <div key={pkg.id} className="card flex flex-col gap-3 p-4">
                        <div>
                          <p className="flex items-center gap-2 font-bold text-ink">
                            <SportPill sport={pkg.sport} /> {pkg.coachProfile.user.name}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {left} of {pkg.totalSessions} sessions left · {formatCents(pkg.totalChargedCents)} paid
                          </p>
                        </div>
                        {/* One notch per session: filled = used */}
                        <div className="flex gap-1" aria-hidden>
                          {Array.from({ length: pkg.totalSessions }).map((_, i) => (
                            <span key={i} className={`h-2 flex-1 rounded-full border border-ink ${i < pkg.sessionsUsed ? "bg-ink" : "bg-gold"}`} />
                          ))}
                        </div>
                        <Link href={`/coaches/${pkg.coachProfileId}/book?packageId=${pkg.id}`} className={`${secondaryButtonClass} w-full`}>
                          Book next session
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <ReferralPanel code={parentProfile.referralCode} creditCents={parentProfile.creditCents} bonusCents={REFERRAL_BONUS_CENTS} />
        </aside>
      </div>
    </div>
  );
}
