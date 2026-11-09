/**
 * Calendar entries for booked sessions: the single-session .ics download, the .ics attached to
 * the booking emails, the "Add to Google Calendar" / "Add to Outlook" links, and the private feed
 * (src/lib/calendarFeed.ts). Server-only: it uses the contact-info filter (src/lib/moderation.ts).
 *
 * Privacy: an entry carries only the sport, the child's first name, the coach's first name, the
 * time, the location the parent entered and a link back to the booking. No phone numbers, emails,
 * last names or notes. Calendar apps sync to other services and get shared with other people, so
 * names are cut to their first word and a location the contact filter would block is replaced.
 *
 * Times: bookings are UTC instants. Files carry Pacific wall-clock times with a full
 * America/Los_Angeles VTIMEZONE (the US rules since 2007), so they show the right time on either
 * side of a daylight-saving change and on a phone set to another timezone. Links use UTC.
 *
 * Format: RFC 5545. CRLF line endings, lines folded at 75 octets without splitting a character,
 * and TEXT values escaped (backslash, semicolon, comma, newline).
 */
import type { BookingStatus, Sport } from "@/generated/prisma/client";
import { COACH_TIMEZONE, toPacificParts } from "@/lib/availability";
import { checkForContactInfo } from "@/lib/moderation";
import { lengthLabel } from "@/lib/sessionLengths";
import { siteLink } from "@/lib/siteUrl";
import { SPORT_LABELS } from "@/lib/sports";

export type CalendarViewer = "PARENT" | "COACH";

export type CalendarSession = {
  id: string;
  sport: Sport;
  scheduledAt: Date;
  durationMinutes: number;
  locationText: string;
  status: BookingStatus;
  childFirstName: string | null;
  /** The coach's name as stored (usually first and last). Only the first word is used. */
  coachName: string;
  createdAt: Date;
  cancelledAt: Date | null;
};

export const LOCATION_FALLBACK = "See the booking for the location";
const UID_DOMAIN = "getassistcoaching.com";
const PRODID = "-//Assist Coaching//Sessions//EN";

// ---------------------------------------------------------------- what an entry says

/** The first word of a typed name, or null if it's empty or the contact filter would block it. */
function firstWord(name: string | null | undefined): string | null {
  const word = name?.trim().split(/\s+/)[0];
  if (!word) return null;
  return checkForContactInfo(word).flagged ? null : word;
}

/** "Basketball with Coach Paul (Emma)" for parents; "Basketball with Emma (Assist Coaching)" for coaches. */
export function eventTitle(s: CalendarSession, viewer: CalendarViewer): string {
  const sport = SPORT_LABELS[s.sport] ?? "Sports";
  const child = firstWord(s.childFirstName);
  const base =
    viewer === "PARENT"
      ? `${sport} with ${firstWord(s.coachName) ? `Coach ${firstWord(s.coachName)}` : "your coach"}${child ? ` (${child})` : ""}`
      : `${sport} with ${child ?? "a family"} (Assist Coaching)`;
  if (s.status === "CANCELLED") return `Cancelled: ${base}`;
  if (s.status === "PENDING_CONSENT") return `${base} (awaiting consent)`;
  return base;
}

/** The location the parent entered, unless the contact filter would block it. */
export function eventLocation(s: Pick<CalendarSession, "locationText">): string {
  const place = s.locationText?.trim().replace(/\s+/g, " ");
  if (!place) return LOCATION_FALLBACK;
  return checkForContactInfo(place).flagged ? LOCATION_FALLBACK : place;
}

/** Where the booking lives in the app: the parent's bookings list, or the coach dashboard. */
export function bookingPath(id: string, viewer: CalendarViewer): string {
  return viewer === "PARENT" ? `/dashboard/bookings#booking-${id}` : `/dashboard#booking-${id}`;
}

export function bookingUrl(id: string, viewer: CalendarViewer): string {
  return siteLink(bookingPath(id, viewer));
}

export function eventDescription(s: CalendarSession, viewer: CalendarViewer): string {
  const sport = SPORT_LABELS[s.sport] ?? "Sports";
  const first =
    s.status === "CANCELLED"
      ? "This session was cancelled."
      : `${lengthLabel(s.durationMinutes)} ${sport.toLowerCase()} session, booked through Assist Coaching.`;
  return `${first}\n\nSee the booking: ${bookingUrl(s.id, viewer)}`;
}

export function sessionEnd(s: Pick<CalendarSession, "scheduledAt" | "durationMinutes">): Date {
  return new Date(s.scheduledAt.getTime() + s.durationMinutes * 60_000);
}

// ---------------------------------------------------------------- .ics

const VTIMEZONE_LA = [
  "BEGIN:VTIMEZONE",
  `TZID:${COACH_TIMEZONE}`,
  `X-LIC-LOCATION:${COACH_TIMEZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** RFC 5545 TEXT escaping. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (UTF-8), never inside a character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** 20261110T163000Z */
export function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** 20261110T163000, the Pacific wall-clock time of an instant. */
export function pacificStamp(d: Date): string {
  const p = toPacificParts(d);
  return `${p.date.replace(/-/g, "")}T${pad(Math.floor(p.minutes / 60))}${pad(p.minutes % 60)}00`;
}

function icsStatus(status: BookingStatus): string {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "PENDING_CONSENT") return "TENTATIVE";
  return "CONFIRMED";
}

function veventLines(s: CalendarSession, viewer: CalendarViewer, now: Date): string[] {
  const modified = s.cancelledAt ?? s.createdAt;
  return [
    "BEGIN:VEVENT",
    `UID:booking-${s.id}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(now)}`,
    `LAST-MODIFIED:${utcStamp(modified)}`,
    `CREATED:${utcStamp(s.createdAt)}`,
    // Bumped when the session is cancelled, so an app that imported the file treats the
    // cancelled copy as newer.
    `SEQUENCE:${s.status === "CANCELLED" ? 1 : 0}`,
    `DTSTART;TZID=${COACH_TIMEZONE}:${pacificStamp(s.scheduledAt)}`,
    `DTEND;TZID=${COACH_TIMEZONE}:${pacificStamp(sessionEnd(s))}`,
    `SUMMARY:${escapeText(eventTitle(s, viewer))}`,
    `LOCATION:${escapeText(eventLocation(s))}`,
    `DESCRIPTION:${escapeText(eventDescription(s, viewer))}`,
    `URL:${bookingUrl(s.id, viewer)}`,
    `STATUS:${icsStatus(s.status)}`,
    `TRANSP:${s.status === "CANCELLED" ? "TRANSPARENT" : "OPAQUE"}`,
    "END:VEVENT",
  ];
}

export type IcsOptions = {
  viewer: CalendarViewer;
  now?: Date;
  /** A subscribed feed: adds the calendar name and a refresh hint (calendar apps may ignore it). */
  feed?: boolean;
};

/** A complete VCALENDAR with one VEVENT per session. */
export function buildIcs(sessions: CalendarSession[], { viewer, now = new Date(), feed = false }: IcsOptions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(feed
      ? [
          "X-WR-CALNAME:Assist Coaching",
          `X-WR-TIMEZONE:${COACH_TIMEZONE}`,
          "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
          "X-PUBLISHED-TTL:PT1H",
        ]
      : []),
    ...VTIMEZONE_LA,
    ...sessions.flatMap((s) => veventLines(s, viewer, now)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** "assist-coaching-basketball-2026-11-10.ics" */
export function icsFileName(s: Pick<CalendarSession, "sport" | "scheduledAt">): string {
  const sport = s.sport.toLowerCase().replace(/_/g, "-");
  return `assist-coaching-${sport}-${toPacificParts(s.scheduledAt).date}.ics`;
}

// ---------------------------------------------------------------- links

/** Google Calendar's "add event" page with this session filled in. */
export function googleCalendarUrl(s: CalendarSession, viewer: CalendarViewer): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(s, viewer),
    dates: `${utcStamp(s.scheduledAt)}/${utcStamp(sessionEnd(s))}`,
    ctz: COACH_TIMEZONE,
    details: eventDescription(s, viewer),
    location: eventLocation(s),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook on the web's "new event" page with this session filled in. */
export function outlookCalendarUrl(s: CalendarSession, viewer: CalendarViewer): string {
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: eventTitle(s, viewer),
    startdt: iso(s.scheduledAt),
    enddt: iso(sessionEnd(s)),
    body: eventDescription(s, viewer),
    location: eventLocation(s),
  });
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

/** Everything the "Add to calendar" buttons need, computed on the server. */
export type CalendarLinks = { ics: string; google: string; outlook: string };

export function calendarLinks(s: CalendarSession, viewer: CalendarViewer): CalendarLinks {
  return {
    ics: `/api/calendar/bookings/${s.id}`,
    google: googleCalendarUrl(s, viewer),
    outlook: outlookCalendarUrl(s, viewer),
  };
}

/** Maps a booking loaded with its child and coach user into what the calendar needs. */
export function toCalendarSession(b: {
  id: string;
  sport: Sport;
  scheduledAt: Date;
  durationMinutes: number;
  locationText: string;
  status: BookingStatus;
  createdAt: Date;
  cancelledAt: Date | null;
  child: { firstName: string } | null;
  coachProfile: { user: { name: string } };
}): CalendarSession {
  return {
    id: b.id,
    sport: b.sport,
    scheduledAt: b.scheduledAt,
    durationMinutes: b.durationMinutes,
    locationText: b.locationText,
    status: b.status,
    createdAt: b.createdAt,
    cancelledAt: b.cancelledAt,
    childFirstName: b.child?.firstName ?? null,
    coachName: b.coachProfile.user.name,
  };
}
