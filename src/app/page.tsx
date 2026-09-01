import Link from "next/link";
import { SPORTS, SPORT_TAG, SPORT_COLOR, SPORT_LABELS } from "@/lib/sports";
import { IconShieldCheck, IconMessage, IconPin, IconUsers, IconArrowRight } from "@/components/icons";
import { goldButtonClass, secondaryButtonClass } from "@/lib/ui";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* HERO — full-bleed pitch green, asymmetric: headline left, pitch-diagram graphic right */}
      <section className="relative overflow-hidden border-b-2 border-ink bg-pitch text-white texture-hatch">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:py-28">
          <div>
            <p className="mb-4 inline-block rotate-[-1.5deg] rounded border-2 border-ink bg-gold px-3 py-1 font-display text-sm tracking-wide text-ink">
              1,200+ verified sessions booked
            </p>
            <h1 className="font-display text-5xl leading-[0.92] sm:text-7xl">
              Get coached by someone who just played the game.
            </h1>
            <p className="mt-6 max-w-md text-lg text-white/85">
              CoachConnect books your kid 1-on-1 time with vetted high school and college athletes — background
              checked, ID-verified, paid safely through the app.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/coaches" className={goldButtonClass}>
                See coaches near you <IconArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/signup/coach" className="press inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-white bg-transparent px-5 py-2.5 text-sm font-bold text-white shadow-[4px_4px_0_rgba(255,255,255,0.5)] hover:bg-white/10">
                Start coaching
              </Link>
            </div>
          </div>

          {/* Signature illustration: a stylized pitch/court diagram, the one deliberate graphic moment */}
          <div className="relative mx-auto hidden aspect-square w-full max-w-sm md:block" aria-hidden>
            <svg viewBox="0 0 300 300" className="h-full w-full">
              <rect x="10" y="10" width="280" height="280" rx="12" fill="none" stroke="#FFCE3D" strokeWidth="3" opacity="0.55" />
              <line x1="150" y1="10" x2="150" y2="290" stroke="#FFCE3D" strokeWidth="3" opacity="0.55" />
              <circle cx="150" cy="150" r="48" fill="none" stroke="#FFCE3D" strokeWidth="3" opacity="0.55" />
              <circle cx="150" cy="150" r="3" fill="#FFCE3D" opacity="0.8" />
              <path d="M10 90a60 60 0 0 1 0 120" fill="none" stroke="#FFCE3D" strokeWidth="3" opacity="0.55" />
              <path d="M290 90a60 60 0 0 0 0 120" fill="none" stroke="#FFCE3D" strokeWidth="3" opacity="0.55" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-6deg] rounded-lg border-2 border-ink bg-white px-4 py-3 text-center font-display text-3xl text-ink shadow-[5px_5px_0_var(--ink)]">
                YOU&apos;RE
                <br />
                UP
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SPORTS STRIP — roster tags, not icon cards */}
      <section className="border-b-2 border-ink bg-chalk">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-2.5 px-4 py-6 sm:px-6">
          {SPORTS.map((sport) => {
            const c = SPORT_COLOR[sport];
            return (
              <Link
                key={sport}
                href={`/coaches?sport=${sport}`}
                className="press flex items-center gap-2 rounded-lg border-2 border-ink px-3 py-2 font-display text-sm tracking-wide shadow-[3px_3px_0_var(--ink)]"
                style={{ background: c.bg, color: c.fg }}
              >
                {SPORT_TAG[sport]}
                <span className="hidden text-xs font-normal opacity-80 sm:inline">— {SPORT_LABELS[sport]}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS — asymmetric numbered list, big display numerals, not a 3-card grid */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <h2 className="mb-10 font-display text-4xl text-ink sm:text-5xl">How a session actually happens</h2>
        <div className="flex flex-col">
          {[
            {
              n: "01",
              title: "Search and compare",
              body: "Filter by sport, city, price, and day. Every profile shown has already cleared verification.",
            },
            {
              n: "02",
              title: "Book and pay through the app",
              body: "You pick the park, gym, or rec center — never the coach. Payment is held until the session is done.",
            },
            {
              n: "03",
              title: "Message without sharing contact info",
              body: "Everything runs through CoachConnect chat. No phone numbers, no addresses, ever.",
            },
            {
              n: "04",
              title: "Rate the coach afterward",
              body: "Funds release to the coach once you mark the session complete. Leave a review for the next family.",
            },
          ].map((step, i, arr) => (
            <div key={step.n} className={`flex gap-6 py-6 ${i !== arr.length - 1 ? "border-b-2 border-line" : ""}`}>
              <span className="font-display text-5xl leading-none text-gold" style={{ WebkitTextStroke: "1.5px var(--ink)" }}>
                {step.n}
              </span>
              <div>
                <h3 className="font-display text-2xl text-ink">{step.title}</h3>
                <p className="mt-1 max-w-lg text-muted-foreground">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SAFETY — image-led two column, not a 4-card grid */}
      <section className="border-y-2 border-ink bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-display text-4xl sm:text-5xl">
              Built like a program a parent would actually trust.
            </h2>
            <p className="mt-4 max-w-md text-white/75">
              Every safeguard here exists because a parent asked for it, not because it looks good on a features
              page.
            </p>
          </div>
          <ul className="flex flex-col gap-5">
            {[
              { icon: IconShieldCheck, title: "ID + background check, verified by a human", body: "No profile goes live until an admin has reviewed both — not just an automated pass." },
              { icon: IconMessage, title: "In-app messaging, always", body: "Coaches and parents never see each other's phone number, email, or home address." },
              { icon: IconPin, title: "Parent picks the location", body: "Sessions default to parks, school gyms, and rec centers — the coach doesn't choose where you meet." },
              { icon: IconUsers, title: "Parent-only bookings", body: "Only a verified guardian account can book, consent to, and pay for a session." },
            ].map((f) => (
              <li key={f.title} className="flex gap-4 border-l-4 border-gold pl-4">
                <f.icon className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
                <div>
                  <p className="font-bold text-white">{f.title}</p>
                  <p className="text-sm text-white/70">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA — bold gold block, full-width, off the grid pattern used above */}
      <section className="bg-gold texture-hatch-dark">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-4xl text-ink sm:text-5xl">Played varsity? Get paid to coach.</h2>
            <p className="mt-2 max-w-md text-ink/80">
              Set your own rate, pick your own hours, get paid safely once the session&apos;s marked complete.
            </p>
          </div>
          <Link href="/signup/coach" className={secondaryButtonClass}>
            Build your coach profile <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
