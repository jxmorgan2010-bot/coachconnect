import Link from "next/link";
import type { BookingStatus, SkillLevel, Sport } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import SportPill from "@/components/SportPill";
import { SPORT_LABELS } from "@/lib/sports";
import { SKILL_LEVEL_LABELS } from "@/lib/skillLevels";
import { bookingHistoryStatus } from "@/lib/bookingHistory";
import { quietLinkClass } from "@/lib/ui";

export type HistoryBooking = {
  id: string;
  scheduledAt: Date;
  sport: Sport;
  status: BookingStatus;
  childLevel: SkillLevel | null;
  childFirstName: string | null;
};

const TZ = "America/Los_Angeles";

function BookingRow({ b, now }: { b: HistoryBooking; now: Date }) {
  const status = bookingHistoryStatus(b.status, b.scheduledAt, now);
  const year = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", timeZone: TZ });
  return (
    <li className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
      <span className="row-span-2 text-sm sm:row-span-1">
        <span className="block font-bold text-ink">
          {b.scheduledAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            // The year only when it isn't this year, so the column stays two short lines on a phone.
            ...(year(b.scheduledAt) !== year(now) ? { year: "numeric" } : {}),
            timeZone: TZ,
          })}
        </span>
        <span className="block text-xs text-muted-foreground">
          {b.scheduledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <SportPill sport={b.sport} />
        <span className="sr-only">{SPORT_LABELS[b.sport]}</span>
        <span className="font-bold text-ink">{b.childFirstName ?? "Child not named"}</span>
        <span className="text-muted-foreground">{b.childLevel ? SKILL_LEVEL_LABELS[b.childLevel] : "Level not set"}</span>
      </span>
      <span className="sm:justify-self-end">
        <Badge variant={status.variant}>{status.label}</Badge>
      </span>
    </li>
  );
}

/** The coach's own bookings. Never rendered on the public profile. */
export default function BookingHistory({
  upcoming,
  past,
  pastTotal,
  page,
  pageSize,
  now,
}: {
  upcoming: HistoryBooking[];
  past: HistoryBooking[];
  pastTotal: number;
  page: number;
  pageSize: number;
  now: Date;
}) {
  const pageCount = Math.max(1, Math.ceil(pastTotal / pageSize));
  const firstShown = (page - 1) * pageSize + 1;

  return (
    <section aria-labelledby="booking-history" className="rounded-xl border-2 border-ink bg-chalk p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="booking-history" className="font-display text-3xl text-ink">Booking history</h2>
        <Badge variant="neutral">Only you see this</Badge>
      </div>

      <h3 className="eyebrow mb-2 text-muted-foreground">Upcoming</h3>
      {upcoming.length === 0 ? (
        <p className="mb-6 rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
          No upcoming sessions.
        </p>
      ) : (
        <ul className="mb-6 divide-y-2 divide-line rounded-lg border-2 border-line bg-surface">
          {upcoming.map((b) => (
            <BookingRow key={b.id} b={b} now={now} />
          ))}
        </ul>
      )}

      <h3 id="past-sessions" className="eyebrow mb-2 scroll-mt-24 text-muted-foreground">Past and cancelled</h3>
      {pastTotal === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
          No past sessions yet. They&apos;ll show here after your first booking.
        </p>
      ) : past.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
          Nothing on this page. <Link href="/dashboard/profile#past-sessions" className="font-bold text-pitch underline">Back to the newest</Link>
        </p>
      ) : (
        <>
          <ul className="divide-y-2 divide-line rounded-lg border-2 border-line bg-surface">
            {past.map((b) => (
              <BookingRow key={b.id} b={b} now={now} />
            ))}
          </ul>
          {pageCount > 1 && (
            <nav aria-label="Past sessions pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {firstShown}–{firstShown + past.length - 1} of {pastTotal}
              </span>
              <span className="flex gap-4">
                {page > 1 && (
                  <Link href={`/dashboard/profile?page=${page - 1}#past-sessions`} className={`${quietLinkClass} text-pitch`}>
                    Newer
                  </Link>
                )}
                {page < pageCount && (
                  <Link href={`/dashboard/profile?page=${page + 1}#past-sessions`} className={`${quietLinkClass} text-pitch`}>
                    Older
                  </Link>
                )}
              </span>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
