import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { formatCents } from "@/lib/money";
import { SPORT_LABELS } from "@/lib/sports";
import type { Sport } from "@/generated/prisma/client";
import ReferralPanel from "./ReferralPanel";
import RatingForm from "./RatingForm";
import ParentTabs from "./ParentTabs";

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl text-ink">Welcome, {name.split(" ")[0]}</h1>
      <p className="mb-6 text-muted-foreground">
        {parentProfile.children.length} child profile{parentProfile.children.length === 1 ? "" : "s"} &middot;{" "}
        {bookings.length} booking{bookings.length === 1 ? "" : "s"} on file.
      </p>

      <div className="mb-8 flex flex-wrap gap-3">
        <Link href="/coaches" className={primaryButtonClass}>Browse coaches</Link>
        <Link href="/messages" className={secondaryButtonClass}>Messages</Link>
      </div>

      <ParentTabs />

      <div className="mb-8">
        <ReferralPanel code={parentProfile.referralCode} creditCents={parentProfile.creditCents} />
      </div>

      {packages.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-2xl text-ink">My packages</h2>
          <div className="flex flex-col gap-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold text-ink">{pkg.coachProfile.user.name} — {SPORT_LABELS[pkg.sport]}</p>
                  <p className="text-sm text-muted-foreground">
                    {pkg.totalSessions - pkg.sessionsUsed} of {pkg.totalSessions} sessions left &middot; {formatCents(pkg.totalChargedCents)} paid
                  </p>
                </div>
                <Link href={`/coaches/${pkg.coachProfileId}/book?packageId=${pkg.id}`} className={secondaryButtonClass}>
                  Book next session
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {needingRating.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-2xl text-ink">Rate your last session</h2>
          <div className="flex flex-col gap-3">
            {needingRating.map((b) => (
              <RatingForm key={b.id} bookingId={b.id} coachName={b.coachProfile.user.name} />
            ))}
          </div>
        </section>
      )}

      {notesByChildSport.size > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-2xl text-ink">Progress history</h2>
          <div className="flex flex-col gap-6">
            {Array.from(notesByChildSport.entries()).map(([key, { childName, sport, entries }]) => (
              <div key={key}>
                <p className="mb-2 font-bold text-ink">{childName} — {SPORT_LABELS[sport]}</p>
                <div className="flex flex-col divide-y-2 divide-line rounded-lg border-2 border-ink">
                  {entries.map((b) => (
                    <div key={b.id} className="p-3">
                      <p className="text-xs font-bold text-muted-foreground">
                        {b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} with {b.coachProfile.user.name}
                      </p>
                      <p className="mt-1 text-sm text-ink">
                        <span className="font-bold">Worked on: </span>
                        {b.progressWhatWorkedOn}
                      </p>
                      {b.progressNextFocus && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="font-bold">Next focus: </span>
                          {b.progressNextFocus}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <Link href="/dashboard/bookings" className={secondaryButtonClass}>
          View all my bookings →
        </Link>
      </section>
    </div>
  );
}
