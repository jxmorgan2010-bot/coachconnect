"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BookingStatus, Sport } from "@/generated/prisma/client";
import type { CalendarLinks } from "@/lib/calendar";
import AddToCalendar from "@/components/AddToCalendar";
import { IconArrowRight, IconPin } from "@/components/icons";
import { goldButtonClass, inputClass, secondaryButtonClass } from "@/lib/ui";
import {
  addDays,
  addMonths,
  longDayLabel,
  monthGrid,
  monthLabel,
  weekDates,
  weekLabel,
  WEEKDAYS_SHORT,
} from "@/lib/calendarGrid";

/** One session, with everything worked out on the server in Pacific time. */
export type FamilyCalendarEvent = {
  id: string;
  /** Pacific calendar date, "2026-11-08". */
  date: string;
  startMinutes: number;
  /** "4:30 – 5:30 PM PT" */
  timeLabel: string;
  /** "4:30" for chips. */
  shortTime: string;
  lengthLabel: string;
  sport: Sport;
  sportLabel: string;
  sportTag: string;
  color: { bg: string; fg: string };
  childId: string | null;
  childName: string;
  coachName: string;
  location: string;
  status: BookingStatus;
  bookingHref: string;
  /** Upcoming, not cancelled: the "Add to calendar" links. */
  calendar: CalendarLinks | null;
};

type View = "month" | "week" | "agenda";

const STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: "Booked",
  PENDING_CONSENT: "Waiting on consent",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const navButton =
  "press inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border-2 border-ink bg-surface px-3 text-sm font-bold text-ink hover:bg-muted";

export default function FamilyCalendar({
  events,
  kids,
  today,
}: {
  events: FamilyCalendarEvent[];
  kids: { id: string; firstName: string }[];
  /** Today's Pacific date, from the server. */
  today: string;
}) {
  // null until the parent picks: the agenda on phones and the month on wider screens, chosen by
  // CSS so the page never flashes the wrong view while it loads.
  const [view, setView] = useState<View | null>(null);
  const [cursor, setCursor] = useState(today);
  const [kid, setKid] = useState("all");
  const [open, setOpen] = useState<FamilyCalendarEvent | null>(null);

  const shown = useMemo(() => (kid === "all" ? events : events.filter((e) => e.childId === kid)), [events, kid]);
  const byDate = useMemo(() => {
    const map = new Map<string, FamilyCalendarEvent[]>();
    for (const e of shown) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    for (const list of map.values()) list.sort((a, b) => a.startMinutes - b.startMinutes);
    return map;
  }, [shown]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border-2 border-dashed border-ink/40 bg-surface p-6 sm:p-8">
        <p className="font-display text-2xl text-ink">No sessions yet — find a coach</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          Sessions you book show up here by day, colored by sport, for every kid.
        </p>
        <Link href="/coaches" className={goldButtonClass}>
          See coaches near you <IconArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const tab = (v: View, auto: string) => {
    const on = view === v;
    const autoOn = view === null ? auto : "";
    return `inline-flex min-h-11 flex-1 items-center justify-center px-3 text-sm font-bold sm:flex-none sm:px-4 ${
      on ? "bg-ink text-white" : `bg-surface text-ink hover:bg-muted ${autoOn}`
    }`;
  };

  const props = { byDate, today, cursor, setCursor, onOpen: setOpen };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div role="group" aria-label="Calendar view" className="flex overflow-hidden rounded-lg border-2 border-ink">
          <button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")} className={tab("agenda", "max-md:bg-ink max-md:text-white")}>
            List
          </button>
          <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")} className={`${tab("week", "")} border-x-2 border-ink`}>
            Week
          </button>
          <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")} className={tab("month", "md:bg-ink md:text-white")}>
            Month
          </button>
        </div>
        {kids.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-bold text-ink">
            Show
            <select value={kid} onChange={(e) => setKid(e.target.value)} className={`${inputClass} w-auto min-w-36`}>
              <option value="all">All kids</option>
              {kids.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.firstName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {view === null ? (
        <>
          <div className="md:hidden">
            <Agenda {...props} />
          </div>
          <div className="hidden md:block">
            <Month {...props} />
          </div>
        </>
      ) : view === "agenda" ? (
        <Agenda {...props} />
      ) : view === "week" ? (
        <Week {...props} />
      ) : (
        <Month {...props} />
      )}

      <SessionDialog event={open} onClose={() => setOpen(null)} />
    </div>
  );
}

type ViewProps = {
  byDate: Map<string, FamilyCalendarEvent[]>;
  today: string;
  cursor: string;
  setCursor: (d: string) => void;
  onOpen: (e: FamilyCalendarEvent) => void;
};

function Nav({ label, onPrev, onNext, onToday, prevLabel, nextLabel }: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="font-display text-2xl text-ink" aria-live="polite">{label}</h3>
      <div className="flex gap-1.5">
        <button type="button" onClick={onPrev} className={navButton} aria-label={prevLabel}>
          ‹
        </button>
        <button type="button" onClick={onToday} className={navButton}>
          Today
        </button>
        <button type="button" onClick={onNext} className={navButton} aria-label={nextLabel}>
          ›
        </button>
      </div>
    </div>
  );
}

/** A session as a colored chip: sport tag, time and kid. Cancelled ones are struck through. */
function Chip({ e, onOpen, compact = false }: { e: FamilyCalendarEvent; onOpen: (e: FamilyCalendarEvent) => void; compact?: boolean }) {
  const cancelled = e.status === "CANCELLED";
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      title={`${e.sportLabel}, ${e.childName}, ${e.timeLabel}${cancelled ? " (cancelled)" : ""}`}
      className={`flex w-full min-w-0 items-center gap-1 rounded-md border-2 px-1.5 text-left text-xs font-bold ${
        compact ? "min-h-7 py-0.5" : "min-h-11 py-1"
      } ${cancelled ? "border-dashed border-ink/50 bg-surface text-muted-foreground line-through" : "border-ink"} ${
        e.status === "PENDING_CONSENT" ? "border-dashed" : ""
      }`}
      style={cancelled ? undefined : { background: e.color.bg, color: e.color.fg }}
    >
      <span className="font-display tracking-wide">{e.sportTag}</span>
      <span className="truncate">
        {e.shortTime} {e.childName}
      </span>
      {cancelled && <span className="sr-only">(cancelled)</span>}
    </button>
  );
}

function Month({ byDate, today, cursor, setCursor, onOpen }: ViewProps) {
  const weeks = monthGrid(cursor);
  const month = cursor.slice(0, 7);
  const [picked, setPicked] = useState<string | null>(null);
  // On phones the cells are too small for chips: a cell is a button that lists its day below.
  const day = picked && picked.startsWith(month) ? picked : today.startsWith(month) ? today : null;
  const dayEvents = day ? byDate.get(day) ?? [] : [];

  return (
    <section aria-label="Month">
      <Nav
        label={monthLabel(cursor)}
        onPrev={() => setCursor(addMonths(cursor, -1))}
        onNext={() => setCursor(addMonths(cursor, 1))}
        onToday={() => setCursor(today)}
        prevLabel="Previous month"
        nextLabel="Next month"
      />
      <div className="overflow-hidden rounded-xl border-2 border-ink bg-surface">
        <div className="grid grid-cols-7 border-b-2 border-ink bg-ink text-white">
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="eyebrow py-2 text-center text-[11px]">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((date) => {
              const list = byDate.get(date) ?? [];
              const inMonth = date.startsWith(month);
              const isToday = date === today;
              const dayNum = Number(date.slice(8));
              return (
                <div key={date} className={`min-w-0 border-r border-line last:border-r-0 ${inMonth ? "" : "bg-chalk"}`}>
                  {/* Phones */}
                  <button
                    type="button"
                    onClick={() => setPicked(date)}
                    aria-label={`${longDayLabel(date)}: ${list.length === 0 ? "no sessions" : list.length === 1 ? "1 session" : `${list.length} sessions`}`}
                    aria-pressed={day === date}
                    className={`flex min-h-12 w-full flex-col items-center gap-1 py-1.5 md:hidden ${day === date ? "bg-gold/30" : ""}`}
                  >
                    <DayNumber n={dayNum} isToday={isToday} muted={!inMonth} />
                    <span className="flex gap-0.5" aria-hidden>
                      {list.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`h-2 w-2 rounded-full border border-ink ${e.status === "CANCELLED" ? "bg-surface" : ""}`}
                          style={e.status === "CANCELLED" ? undefined : { background: e.color.bg }}
                        />
                      ))}
                    </span>
                  </button>
                  {/* Wider screens */}
                  <div className="hidden min-h-28 flex-col gap-1 p-1.5 md:flex">
                    <DayNumber n={dayNum} isToday={isToday} muted={!inMonth} />
                    {list.slice(0, 3).map((e) => (
                      <Chip key={e.id} e={e} onOpen={onOpen} compact />
                    ))}
                    {list.length > 3 && <p className="px-1 text-xs font-bold text-muted-foreground">+{list.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {day && (
        <div className="mt-4 md:hidden">
          <h4 className="mb-2 text-sm font-bold text-ink">{longDayLabel(day)}</h4>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions this day.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <AgendaRow e={e} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function DayNumber({ n, isToday, muted }: { n: number; isToday: boolean; muted: boolean }) {
  return (
    <span
      className={`inline-flex h-6 min-w-6 items-center justify-center self-center rounded-full px-1 text-xs font-bold md:self-start ${
        isToday ? "bg-gold text-ink ring-2 ring-ink" : muted ? "text-muted-foreground" : "text-ink"
      }`}
    >
      {isToday && <span className="sr-only">Today, </span>}
      {n}
    </span>
  );
}

function Week({ byDate, today, cursor, setCursor, onOpen }: ViewProps) {
  const days = weekDates(cursor);
  return (
    <section aria-label="Week">
      <Nav
        label={weekLabel(cursor)}
        onPrev={() => setCursor(addDays(cursor, -7))}
        onNext={() => setCursor(addDays(cursor, 7))}
        onToday={() => setCursor(today)}
        prevLabel="Previous week"
        nextLabel="Next week"
      />
      <ol className="grid gap-2 md:grid-cols-7">
        {days.map((date, i) => {
          const list = byDate.get(date) ?? [];
          const isToday = date === today;
          return (
            <li
              key={date}
              className={`flex min-w-0 flex-col gap-1.5 rounded-lg border-2 p-2 md:min-h-40 ${
                isToday ? "border-ink bg-gold/15" : "border-line bg-surface"
              }`}
            >
              <p className="flex items-baseline gap-1.5 text-sm font-bold text-ink">
                <span className="eyebrow text-muted-foreground">{WEEKDAYS_SHORT[i]}</span>
                {Number(date.slice(8))}
                {isToday && <span className="text-xs font-bold text-pitch">Today</span>}
              </p>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground md:sr-only">No sessions</p>
              ) : (
                list.map((e) => <Chip key={e.id} e={e} onOpen={onOpen} />)
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function AgendaRow({ e, onOpen }: { e: FamilyCalendarEvent; onOpen: (e: FamilyCalendarEvent) => void }) {
  const cancelled = e.status === "CANCELLED";
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className={`flex w-full min-h-11 items-stretch gap-3 rounded-lg border-2 border-ink bg-surface text-left hover:bg-muted ${
        cancelled ? "border-dashed opacity-75" : ""
      }`}
    >
      <span
        aria-hidden
        className="w-2 shrink-0 rounded-l-md"
        style={{ background: cancelled ? "var(--line)" : e.color.bg }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 pr-3">
        <span className={`text-base font-bold text-ink ${cancelled ? "line-through" : ""}`}>
          {e.sportLabel} · {e.childName}
        </span>
        <span className="text-sm text-ink">{e.timeLabel}</span>
        <span className="truncate text-sm text-muted-foreground">
          With {e.coachName} · {e.location}
        </span>
        {e.status !== "CONFIRMED" && <span className="text-xs font-bold text-muted-foreground">{STATUS_LABEL[e.status]}</span>}
      </span>
    </button>
  );
}

function Agenda({ byDate, today, onOpen }: ViewProps) {
  const [showEarlier, setShowEarlier] = useState(false);
  const dates = [...byDate.keys()].sort();
  const upcoming = dates.filter((d) => d >= today);
  const earlier = dates.filter((d) => d < today).reverse();

  const group = (list: string[]) => (
    <ol className="flex flex-col gap-4">
      {list.map((date) => (
        <li key={date}>
          <h4 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-ink">
            {longDayLabel(date)}
            {date === today && <span className="text-xs text-pitch">Today</span>}
          </h4>
          <ul className="flex flex-col gap-2">
            {byDate.get(date)!.map((e) => (
              <li key={e.id}>
                <AgendaRow e={e} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );

  return (
    <section aria-label="List of sessions" className="flex flex-col gap-4">
      {upcoming.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-line p-4">
          <p className="text-muted-foreground">Nothing coming up.</p>
          <Link href="/coaches" className={secondaryButtonClass}>
            Find a coach
          </Link>
        </div>
      ) : (
        group(upcoming)
      )}
      {earlier.length > 0 && (
        <div className="border-t-2 border-line pt-3">
          <button
            type="button"
            onClick={() => setShowEarlier((v) => !v)}
            aria-expanded={showEarlier}
            className="inline-flex min-h-11 items-center text-sm font-bold text-ink underline-offset-4 hover:underline"
          >
            {showEarlier ? "Hide earlier sessions" : `Show earlier sessions (${earlier.reduce((n, d) => n + byDate.get(d)!.length, 0)})`}
          </button>
          {showEarlier && <div className="mt-3">{group(earlier)}</div>}
        </div>
      )}
    </section>
  );
}

function SessionDialog({ event, onClose }: { event: FamilyCalendarEvent | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (event && !dialog.open) dialog.showModal();
    if (!event && dialog.open) dialog.close();
  }, [event]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // a tap on the backdrop
      }}
      aria-labelledby="session-dialog-title"
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-xl border-2 border-ink bg-surface p-0 text-ink shadow-patch backdrop:bg-ink/60"
    >
      {event && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow mb-1 text-pitch">{STATUS_LABEL[event.status]}</p>
              <h3 id="session-dialog-title" className={`font-display text-2xl text-ink ${event.status === "CANCELLED" ? "line-through" : ""}`}>
                {event.sportLabel} · {event.childName}
              </h3>
            </div>
            <button type="button" onClick={onClose} className={navButton} aria-label="Close">
              ✕
            </button>
          </div>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="font-bold text-muted-foreground">When</dt>
            <dd>
              {longDayLabel(event.date)}
              <br />
              {event.timeLabel} ({event.lengthLabel})
            </dd>
            <dt className="font-bold text-muted-foreground">Coach</dt>
            <dd>{event.coachName}</dd>
            <dt className="font-bold text-muted-foreground">Where</dt>
            <dd className="flex items-start gap-1 break-words">
              <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-pitch" />
              {event.location}
            </dd>
          </dl>
          {event.calendar && <AddToCalendar links={event.calendar} />}
          <Link href={event.bookingHref} className={`${secondaryButtonClass} self-start`} onClick={onClose}>
            See the booking <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </dialog>
  );
}
