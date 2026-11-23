import { Suspense } from "react";
import Link from "next/link";
import { getCurrentSession } from "@/lib/session";
import { getCoachReviewStatus } from "@/lib/coachReview";
import SubmittedForReviewBanner from "@/components/SubmittedForReviewBanner";
import { SPORTS } from "@/lib/sports";
import SportBrowser from "@/components/SportBrowser";
import { IconArrowRight } from "@/components/icons";
import { SafetySection } from "@/components/SafetyPoints";
import { goldButtonClass, secondaryButtonClass } from "@/lib/ui";
import { EXPERIENCED_COACHES_ENABLED } from "@/lib/features";

// Every line on this page has to be something the app actually does today.
// Background checks are a placeholder, so they are not claimed anywhere here.
// The safety list lives in components/SafetyPoints (shared with the booking page).
const STEPS = [
  {
    title: "Find your kid's coach",
    body: "Filter by sport, city, price, and day. Coaches only show up once an admin has approved their ID.",
  },
  {
    title: "Book and pay in the app",
    body: "You choose the place — a park, a gym, or a rec center. For a single session your card is held, not charged, until it's over.",
  },
  {
    title: "Message without swapping numbers",
    body: "Plan the details in Assist Coaching chat. Coaches never see your phone number or email.",
  },
  {
    title: "Mark it done and leave a review",
    body: "Your card is saved when you book, held 2 days before, and charged when you mark the session complete.",
  },
];

/** Where "Finish" in coach onboarding lands: tells a coach waiting for review where they stand. */
async function CoachSubmittedNotice() {
  const session = await getCurrentSession();
  if (session?.user?.role !== "COACH") return null;
  const status = await getCoachReviewStatus(session.user.id);
  if (!status?.awaitingReview) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
      <SubmittedForReviewBanner />
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* LAUNCH-MARKET BANNER — CoachConnect is Bay Area only at launch */}
      <div className="on-dark border-b-2 border-ink bg-ink px-4 py-2.5 text-center text-sm font-bold text-white">
        Bay Area only for now.{" "}
        <Link href="/waitlist" className="underline decoration-gold decoration-2 underline-offset-4">
          Join the waitlist for your area
        </Link>
      </div>

      <Suspense fallback={null}>
        <CoachSubmittedNotice />
      </Suspense>

      {/* HERO — full-bleed pitch green, asymmetric: headline left, pitch diagram right */}
      <section className="on-dark relative overflow-hidden border-b-2 border-ink bg-pitch text-white texture-hatch">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:py-24">
          <div>
            <p className="eyebrow mb-5 text-gold-bright">
              Bay Area · {SPORTS.length} sports · 1-on-1
            </p>
            <h1 className="text-display-xl max-w-[15ch] font-display">
              {EXPERIENCED_COACHES_ENABLED
                ? "Push past your limits with coaches who know the game."
                : "Push past your limits with athletes who play the game."}
            </h1>
            <p className="mt-6 max-w-md text-lg text-white/85">
              Book your kid 1&#8209;on&#8209;1 time with{" "}
              {EXPERIENCED_COACHES_ENABLED ? "student-athletes and experienced coaches" : "high school and college athletes"}.
              An admin approves every coach before their profile goes live, and you pay through the app.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/coaches" className={goldButtonClass}>
                See coaches near you <IconArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/signup/coach"
                className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border-2 border-white px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10"
              >
                I want to coach
              </Link>
            </div>
          </div>

          {/* Signature illustration: a stylized pitch diagram, the one deliberate graphic moment */}
          <div className="relative mx-auto hidden aspect-square w-full max-w-sm text-gold-bright md:block" aria-hidden>
            <svg
              viewBox="0 0 300 300"
              className="float h-full w-full"
              style={{ "--float-duration": "6s", "--float-distance": "-4px" } as React.CSSProperties}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <g opacity="0.55">
                <rect x="10" y="10" width="280" height="280" rx="12" />
                <line x1="150" y1="10" x2="150" y2="290" />
                <circle cx="150" cy="150" r="48" />
                <path d="M10 90a60 60 0 0 1 0 120" />
                <path d="M290 90a60 60 0 0 0 0 120" />
              </g>
              <circle cx="150" cy="150" r="3" fill="currentColor" stroke="none" opacity="0.8" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="float rotate-[-6deg] rounded-lg border-2 border-ink bg-white px-4 py-3 text-center font-display text-3xl leading-none text-ink shadow-patch"
                style={{ "--float-duration": "5s", "--float-distance": "-7px", "--float-delay": "-1.5s" } as React.CSSProperties}
              >
                YOU&apos;RE
                <br />
                UP
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SPORTS STRIP — roster chips with full sport names: six up front, every sport (grouped) behind
          "All sports". See SportBrowser. */}
      <section aria-labelledby="sports-heading" className="border-b-2 border-ink bg-chalk">
        <div data-reveal className="mx-auto max-w-6xl px-4 py-7 sm:px-6 md:py-8">
          <h2 id="sports-heading" className="eyebrow mb-5 text-muted-foreground">
            Browse by sport
          </h2>
          <SportBrowser />
        </div>
      </section>

      {/* HOW IT WORKS — a real sequence, so it's numbered. Heading pinned left, steps right. */}
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div data-reveal className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-display-lg font-display text-ink">Here&apos;s how a session works</h2>
          <p className="mt-4 max-w-sm text-muted-foreground">
            Four steps, start to finish. You choose where and when, and your card is charged when you mark the session
            complete.
          </p>
        </div>
        <ol data-reveal-group className="flex flex-col">
          {STEPS.map((step, i) => (
            <li key={step.title} className={`flex gap-5 py-6 sm:gap-7 ${i !== STEPS.length - 1 ? "border-b-2 border-line" : ""} ${i === 0 ? "pt-0" : ""}`}>
              <span
                aria-hidden
                className="w-12 shrink-0 font-display text-5xl leading-none text-gold"
                style={{ WebkitTextStroke: "1.5px var(--ink)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-display-sm font-display text-ink">{step.title}</h3>
                <p className="mt-2 max-w-lg text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <SafetySection />

      {/* COACH CTA — bold gold block, full-width, off the grid pattern used above */}
      <section className="bg-gold texture-hatch-dark">
        <div data-reveal className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between md:py-16">
          <div>
            <h2 className="text-display-lg font-display text-ink">
              {EXPERIENCED_COACHES_ENABLED ? "Played varsity or coached for years? Coach your sport." : "Played varsity? Coach your sport."}
            </h2>
            <p className="mt-3 max-w-md text-ink/85">
              Set your own rate and your own hours. During the beta, coach payouts aren&apos;t set up yet.
            </p>
          </div>
          <Link href="/signup/coach" className={`${secondaryButtonClass} shrink-0 whitespace-nowrap`}>
            Build your coach profile <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
