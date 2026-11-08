import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SPORTS, SPORT_COLOR, SPORT_LABELS, SPORT_TAG } from "@/lib/sports";
import SportPill from "@/components/SportPill";
import { IconArrowRight } from "@/components/icons";
import { quietLinkClass } from "@/lib/ui";
import TrainingPlanChecklist from "@/components/TrainingPlanChecklist";
import CalendarSync from "@/components/CalendarSync";
import ParentTabs from "../ParentTabs";
import ChildLevelsCard from "./ChildLevelsCard";
import FamilyCalendar, { type FamilyCalendarEvent } from "./FamilyCalendar";
import MessageEmailToggle from "@/components/MessageEmailToggle";
import { formatPacificTime } from "@/lib/sessionTiming";
import { formatSlotLabel, toPacificParts } from "@/lib/availability";
import { lengthLabel } from "@/lib/sessionLengths";
import { bookingPath, calendarLinks, toCalendarSession } from "@/lib/calendar";
import { feedMadeLabel, parseChildIds } from "@/lib/calendarFeed";
import { feedStatus } from "@/lib/calendarFeedStore";

const CALENDAR_PAST_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function FamilyDashboardPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/family");
  if (session.user.role !== "PARENT") redirect("/dashboard");

  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { name: true, email: true, messageEmailAlerts: true } },
      children: { orderBy: { createdAt: "asc" }, include: { sportLevels: true } },
    },
  });
  if (!parentProfile) redirect("/dashboard");

  const now = new Date();
  const [calendarBookings, upcoming, withNotes, trainingPlanItems, feed] = await Promise.all([
    // The calendar: the past year and everything ahead, every status. One family's sessions are
    // few enough to send to the browser at once, so paging months needs no extra requests.
    prisma.booking.findMany({
      where: { parentProfileId: parentProfile.id, scheduledAt: { gte: new Date(now.getTime() - CALENDAR_PAST_DAYS * DAY_MS) } },
      include: { coachProfile: { include: { user: { select: { name: true } } } }, child: true },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { parentProfileId: parentProfile.id, status: "CONFIRMED" },
      select: { childId: true, sport: true },
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
    feedStatus(session.user.id),
  ]);

  const calendarEvents: FamilyCalendarEvent[] = calendarBookings.map((b) => {
    const start = toPacificParts(b.scheduledAt);
    const end = new Date(b.scheduledAt.getTime() + b.durationMinutes * 60_000);
    const s = toCalendarSession(b);
    return {
      id: b.id,
      date: start.date,
      startMinutes: start.minutes,
      timeLabel: `${formatSlotLabel(start.minutes)} – ${formatPacificTime(end)}`,
      shortTime: formatSlotLabel(start.minutes).replace(":00", "").replace(" AM", "a").replace(" PM", "p"),
      lengthLabel: lengthLabel(b.durationMinutes),
      sport: b.sport,
      sportLabel: SPORT_LABELS[b.sport],
      sportTag: SPORT_TAG[b.sport],
      color: SPORT_COLOR[b.sport],
      childId: b.childId,
      childName: b.child?.firstName ?? "Session",
      coachName: b.coachProfile.user.name,
      location: b.locationText,
      status: b.status,
      bookingHref: bookingPath(b.id, "PARENT"),
      calendar:
        (b.status === "CONFIRMED" || b.status === "PENDING_CONSENT") && end > now ? calendarLinks(s, "PARENT") : null,
    };
  });

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

      <section aria-labelledby="family-calendar" className="mb-10">
        <h2 id="family-calendar" className="mb-1 font-display text-3xl text-ink">Calendar</h2>
        <p className="mb-4 text-sm text-muted-foreground">Every kid&apos;s sessions, colored by sport. Tap one for details.</p>
        <FamilyCalendar
          events={calendarEvents}
          kids={parentProfile.children.map((c) => ({ id: c.id, firstName: c.firstName }))}
          today={toPacificParts(now).date}
        />
      </section>

      <section aria-labelledby="family-sync" className="mb-10 rounded-xl border-2 border-ink bg-surface p-4 sm:p-5">
        <h2 id="family-sync" className="mb-3 font-display text-3xl text-ink">Sync to my calendar</h2>
        <CalendarSync
          role="PARENT"
          feed={
            feed
              ? {
                  madeLabel: feedMadeLabel(feed),
                  childIds: parseChildIds(feed.childIds),
                }
              : null
          }
          kids={parentProfile.children.map((c) => ({ id: c.id, firstName: c.firstName }))}
        />
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
        <div className="mt-5 border-t-2 border-line pt-4">
          <h3 className="eyebrow mb-2 text-muted-foreground">Email alerts</h3>
          <MessageEmailToggle initial={parentProfile.user.messageEmailAlerts} />
        </div>
      </section>
    </div>
  );
}
