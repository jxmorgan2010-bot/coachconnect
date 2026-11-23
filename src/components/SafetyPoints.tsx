import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  IconShieldCheck,
  IconUsers,
  IconPin,
  IconMessage,
  IconCard,
  IconCalendar,
  IconStar,
  IconFlag,
} from "@/components/icons";

type SafetyPoint = { id: string; icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; body: string };

/**
 * Every line here has to be something the app does or a rule it states today. Checked against
 * the code: ID approval gates going live (isCoachLive), reviews need the parent's own completed
 * booking, contact-sharing messages are blocked (contactPolicy), single sessions are held and
 * captured after, packages are paid up front, and parent cancels are free until 11:59 PM Pacific
 * the night before. There is no user blocking, and background checks are a placeholder, so
 * neither is claimed.
 */
export const SAFETY_POINTS: SafetyPoint[] = [
  {
    id: "id",
    icon: IconShieldCheck,
    title: "An admin approves every coach",
    body: "We review each coach's ID before their profile can show up in search.",
  },
  {
    id: "parent",
    icon: IconUsers,
    title: "A parent stays for the whole session",
    body: "A parent or guardian is there from start to finish, every time.",
  },
  {
    id: "place",
    icon: IconPin,
    title: "You pick a public place",
    body: "Choose where you meet, like a park or a school or rec center gym. Sessions have to be somewhere public.",
  },
  {
    id: "chat",
    icon: IconMessage,
    title: "Chat stays in the app",
    body: "Coaches never see your phone number or email, and messages that try to share contact info are blocked.",
  },
  {
    id: "pay",
    icon: IconCard,
    title: "Pay after the session",
    body: "For a single session, your card is held, not charged, until it's over. Packages are paid up front.",
  },
  {
    id: "cancel",
    icon: IconCalendar,
    title: "Free cancellation until the night before",
    body: "Cancel by 11:59 PM Pacific the night before and it costs nothing, or the session goes back into your package.",
  },
  {
    id: "reviews",
    icon: IconStar,
    title: "Reviews from real sessions",
    body: "Only a family who booked and finished a session with a coach can review them.",
  },
  {
    id: "report",
    icon: IconFlag,
    title: "Report anything",
    body: "Use Report on any coach profile or conversation, and an admin will look into it.",
  },
];

/** The booking page's short version: what matters before you meet. Payment terms sit by the pay button. */
const BOOKING_POINT_IDS = ["id", "parent", "place", "chat"];

/** Home page: the full list on the dark band. Anchor: /#safety. */
export function SafetySection() {
  return (
    <section id="safety" aria-labelledby="safety-heading" className="on-dark scroll-mt-20 border-y-2 border-ink bg-ink text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[0.75fr_1.25fr] lg:gap-14">
        <div data-reveal>
          <h2 id="safety-heading" className="text-display-lg font-display">
            How we keep sessions safe
          </h2>
          <p className="mt-4 max-w-sm text-white/75">What&apos;s in place today, in plain terms.</p>
        </div>
        <ul data-reveal-group className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
          {SAFETY_POINTS.map(({ id, icon: Icon, title, body }) => (
            <li key={id} className="flex gap-4 border-l-4 border-gold pl-4">
              <Icon className="mt-0.5 h-6 w-6 shrink-0 text-gold" aria-hidden />
              <div>
                <p className="font-bold text-white">{title}</p>
                <p className="mt-1 text-sm text-white/75">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Booking page: four short lines, with a link to the full list. */
export function SafetySummary() {
  const points = SAFETY_POINTS.filter((p) => BOOKING_POINT_IDS.includes(p.id));
  return (
    <section aria-labelledby="booking-safety-heading" className="rounded-lg border-2 border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id="booking-safety-heading" className="font-display text-lg leading-none text-ink">
          How we keep sessions safe
        </h2>
        <Link href="/#safety" className="inline-flex min-h-11 items-center text-sm font-bold text-pitch underline-offset-4 hover:underline">
          See all safety rules
        </Link>
      </div>
      <ul className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
        {points.map(({ id, icon: Icon, title }) => (
          <li key={id} className="flex items-start gap-2.5 text-sm font-bold text-ink">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-pitch" aria-hidden />
            {title}
          </li>
        ))}
      </ul>
    </section>
  );
}
