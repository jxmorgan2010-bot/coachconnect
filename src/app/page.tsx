import Link from "next/link";
import { SPORTS, SPORT_TAG, SPORT_COLOR, SPORT_LABELS } from "@/lib/sports";
import { AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";
import { IconShieldCheck, IconMessage, IconPin, IconUsers, IconArrowRight } from "@/components/icons";
import { goldButtonClass, secondaryButtonClass } from "@/lib/ui";

// Every line on this page has to be something the app actually does today.
// Background checks are a placeholder, so they are not claimed anywhere here.
const STEPS = [
  {
    title: "Find a coach",
    body: "Filter by sport, city, price, and day. Coaches only show up once an admin has approved their ID.",
  },
  {
    title: "Book and pay in the app",
    body: "You choose the park, gym, or rec center. For a single session your card is held, not charged, until it's over.",
  },
  {
    title: "Message without swapping numbers",
    body: "Plan the details in CoachConnect chat. Coaches never see your phone number or email.",
  },
  {
    title: "Mark it done and leave a review",
    body: `The coach gets paid when you mark the session complete — or automatically ${AUTO_RELEASE_GRACE_HOURS} hours after it ends if you don't report a problem.`,
  },
];

const SAFEGUARDS = [
  {
    icon: IconShieldCheck,
    title: "A person reviews every coach's ID",
    body: "An admin looks at each ID before the profile can appear in search. No automatic approvals.",
  },
  {
    icon: IconUsers,
    title: "Parents book, not kids",
    body: "Only a parent account can book or pay for a session. Whoever signs up confirms they're the parent or guardian.",
  },
  {
    icon: IconPin,
    title: "You pick the place",
    body: "You set the session location when you book. The coach doesn't choose where you meet.",
  },
  {
    icon: IconMessage,
    title: "Chat stays in the app",
    body: "Coaches never see your phone number or email, and you can report any message thread.",
  },
];

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

      {/* HERO — full-bleed pitch green, asymmetric: headline left, pitch diagram right */}
      <section className="on-dark relative overflow-hidden border-b-2 border-ink bg-pitch text-white texture-hatch">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:py-24">
          <div>
            <p className="eyebrow mb-5 text-gold-bright">
              Bay Area · {SPORTS.length} sports · 1-on-1
            </p>
            <h1 className="text-display-xl max-w-[15ch] font-display">
              Push past your limits with athletes who play the game.
            </h1>
            <p className="mt-6 max-w-md text-lg text-white/85">
              Book your kid 1&#8209;on&#8209;1 time with high school and college athletes. A person checks every coach&apos;s ID
              before their profile goes live, and you pay through the app.
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
            <svg viewBox="0 0 300 300" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="3">
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
              <span className="rotate-[-6deg] rounded-lg border-2 border-ink bg-white px-4 py-3 text-center font-display text-3xl leading-none text-ink shadow-patch">
                YOU&apos;RE
                <br />
                UP
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SPORTS STRIP — roster tags, not icon cards */}
      <section aria-labelledby="sports-heading" className="border-b-2 border-ink bg-chalk">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-center md:gap-6">
          <h2 id="sports-heading" className="eyebrow shrink-0 text-muted-foreground">
            Browse by sport
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {SPORTS.map((sport) => {
              const c = SPORT_COLOR[sport];
              return (
                <Link
                  key={sport}
                  href={`/coaches?sport=${sport}`}
                  aria-label={`${SPORT_LABELS[sport]} coaches`}
                  className="press flex min-h-11 items-center gap-2 rounded-lg border-2 border-ink px-3 font-display text-sm tracking-wide shadow-patch-xs"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {SPORT_TAG[sport]}
                  <span className="hidden font-sans text-xs font-bold opacity-85 xl:inline">{SPORT_LABELS[sport]}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — a real sequence, so it's numbered. Heading pinned left, steps right. */}
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-display-lg font-display text-ink">How a session actually happens</h2>
          <p className="mt-4 max-w-sm text-muted-foreground">
            Four steps, start to finish. You stay in charge of where, when, and when the coach gets paid.
          </p>
        </div>
        <ol className="flex flex-col">
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

      {/* SAFEGUARDS — two column on ink, gold rule per item, not a card grid */}
      <section className="on-dark border-y-2 border-ink bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <h2 className="text-display-lg font-display">Built like a program a parent would actually trust.</h2>
            <p className="mt-4 max-w-md text-white/75">
              Here&apos;s what&apos;s in place today, in plain terms.
            </p>
          </div>
          <ul className="flex flex-col gap-6">
            {SAFEGUARDS.map((f) => (
              <li key={f.title} className="flex gap-4 border-l-4 border-gold pl-4">
                <f.icon className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
                <div>
                  <p className="font-bold text-white">{f.title}</p>
                  <p className="mt-1 text-sm text-white/75">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* COACH CTA — bold gold block, full-width, off the grid pattern used above */}
      <section className="bg-gold texture-hatch-dark">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between md:py-16">
          <div>
            <h2 className="text-display-lg font-display text-ink">Played varsity? Get paid to coach.</h2>
            <p className="mt-3 max-w-md text-ink/85">
              Set your own rate and your own hours. You get paid through the app once each session is marked complete.
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
