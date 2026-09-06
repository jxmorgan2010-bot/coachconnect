import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import ReferralPanel from "./ReferralPanel";
import RatingForm from "./RatingForm";
import ParentTabs from "./ParentTabs";

export default async function ParentDashboard({ userId, name }: { userId: string; name: string }) {
  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId },
    include: { children: { orderBy: { createdAt: "asc" } } },
  });
  if (!parentProfile) return null;

  const bookings = await prisma.booking.findMany({
    where: { parentProfileId: parentProfile.id },
    include: {
      coachProfile: { include: { user: true } },
      child: true,
      review: true,
      dispute: true,
    },
    orderBy: { scheduledAt: "desc" },
  });

  const needingRating = bookings.filter((b) => b.status === "COMPLETED" && !b.review);
  const withNotes = bookings.filter((b) => b.status === "COMPLETED" && b.progressNoteAddedAt);

  const notesByChild = new Map<string, { childName: string; entries: typeof withNotes }>();
  for (const b of withNotes) {
    const key = b.childId ?? "unknown";
    const childName = b.child?.firstName ?? "Your child";
    if (!notesByChild.has(key)) notesByChild.set(key, { childName, entries: [] });
    notesByChild.get(key)!.entries.push(b);
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

      {notesByChild.size > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-2xl text-ink">Progress history</h2>
          <div className="flex flex-col gap-6">
            {Array.from(notesByChild.entries()).map(([childId, { childName, entries }]) => (
              <div key={childId}>
                <p className="mb-2 font-bold text-ink">{childName}</p>
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
