import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowRight, IconUsers, IconWhistle } from "@/components/icons";
import { goldButtonClass, secondaryButtonClass } from "@/lib/ui";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { EXPERIENCED_COACHES_ENABLED } from "@/lib/features";

export const metadata: Metadata = {
  title: "About Assist Coaching",
  description:
    "Assist Coaching connects Bay Area families with athletes for 1-on-1 sports lessons. A parent stays for every session, and booking, messages and payment stay in the app.",
};

// Same rule as the home page: every line here is something the app does today, or the
// founder's own story in their words. Coach payouts aren't live during the beta, and coaches
// must be 18+, so the story talks about why it was built, not what coaches earn today.
const STEPS = [
  { title: "Find a coach", body: "Filter by sport, city, price, and day." },
  {
    title: "Book and pay in the app",
    // Owner's wording, scoped to single sessions: packages are charged in full at purchase.
    body: "Pick a time and a public place. For a single session, your card isn't charged until after the session.",
  },
  { title: "Show up together", body: "A parent or guardian stays for the whole session." },
  { title: "Mark it done", body: "Then leave a review so other families know how it went." },
];

const BELIEFS = [
  {
    title: "Kids train somewhere safe.",
    body: "Sessions happen in public places, with a parent there from start to finish.",
  },
  {
    title: "Coaching is real work experience.",
    body: "Showing up on time, talking with families and keeping a schedule are skills that last.",
  },
  {
    title: "Money and messages stay in the app.",
    body: "That keeps payments protected and everyone's contact details private.",
  },
];

export default function AboutPage() {
  const who = EXPERIENCED_COACHES_ENABLED
    ? "student-athletes and experienced adult coaches"
    : "high school and college athletes";

  return (
    <div className="flex flex-col">
      {/* OPENING — pitch band, like the coach search header */}
      <section className="on-dark texture-hatch border-b-2 border-ink bg-pitch text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
          <p className="eyebrow mb-4 text-gold-bright">About Assist Coaching</p>
          <h1 className="text-display-xl max-w-[16ch] font-display">1-on-1 lessons from athletes who&apos;ve been there.</h1>
          <p className="mt-6 max-w-xl text-lg text-white/85">
            Assist Coaching connects Bay Area families with {who} for 1&#8209;on&#8209;1 sports lessons. A parent stays
            for every session, you pick a public place, and booking, messages and payment all happen in the app.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS — a real sequence, so it's numbered */}
      <section aria-labelledby="how-heading" className="border-b-2 border-ink bg-chalk">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <h2 id="how-heading" className="text-display-md font-display text-ink">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t-4 border-gold pt-4">
                <span aria-hidden className="font-display text-3xl leading-none text-pitch">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-display-sm font-display text-ink">{step.title}</h3>
                <p className="mt-2 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* OUR STORY — editorial two-column: heading pinned left, the founder's words right */}
      <section aria-labelledby="story-heading" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="reveal grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <h2 id="story-heading" className="text-display-lg font-display text-ink">
              Our story
            </h2>
            <p className="mt-3 text-sm font-bold text-muted-foreground">From the founder</p>
          </div>
          <div className="flex max-w-2xl flex-col gap-5 border-l-4 border-gold pl-5 text-lg text-ink sm:pl-7">
            <p>
              I coached young kids before I started Assist Coaching, and I still do. It&apos;s been an amazing
              experience: making new connections, teaching kids, and seeing them smile when they learn something new.
            </p>
            <p>
              Coaching teaches more than a sport. Talking with families, showing up on time and keeping a schedule
              organized are real people skills and real job skills, and they&apos;re a great start for young athletes.
            </p>
            <p>
              Growing up, I saw a lot of unemployment. I watched people I knew struggle, some of them in tears, because
              they couldn&apos;t find a job. I wanted to build an easier way for people to earn extra money and stay
              afloat, doing something they&apos;re already good at.
            </p>
          </div>
        </div>
      </section>

      {/* WHAT WE BELIEVE — on ink, linking to the full safety list on the home page */}
      <section aria-labelledby="beliefs-heading" className="on-dark border-y-2 border-ink bg-ink text-white">
        <div className="reveal mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h2 id="beliefs-heading" className="text-display-lg font-display">
            What we believe
          </h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {BELIEFS.map((b) => (
              <li key={b.title} className="border-l-4 border-gold pl-4">
                <p className="font-bold text-white">{b.title}</p>
                <p className="mt-1 text-sm text-white/75">{b.body}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/#safety"
            className="mt-8 inline-flex min-h-11 items-center gap-1.5 font-bold text-gold-bright underline-offset-4 hover:underline"
          >
            See how we keep sessions safe <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CALLS TO ACTION — the two sign-up audiences, as trading cards like /signup */}
      <section aria-label="Get started" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="on-dark texture-hatch flex flex-col items-start gap-4 rounded-xl border-2 border-ink bg-pitch p-6 text-white shadow-patch sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-lg border-2 border-ink bg-white text-pitch">
              <IconUsers className="h-6 w-6" />
            </span>
            <h2 className="text-display-md font-display">For parents</h2>
            <p className="text-white/85">See who coaches your kid&apos;s sport near you, and book your first session.</p>
            <Link href="/coaches" className={`${goldButtonClass} mt-auto`}>
              Find a coach <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="texture-hatch-dark flex flex-col items-start gap-4 rounded-xl border-2 border-ink bg-gold p-6 text-ink shadow-patch sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-lg border-2 border-ink bg-ink text-gold">
              <IconWhistle className="h-6 w-6" />
            </span>
            <h2 className="text-display-md font-display">For coaches</h2>
            <p className="text-ink/85">
              {EXPERIENCED_COACHES_ENABLED
                ? "Played in high school or college, or coached for years? Set your own rate and hours."
                : "Played in high school or college? Set your own rate and hours."}{" "}
              During the beta, coach payouts aren&apos;t set up yet.
            </p>
            {!ENABLE_MINOR_COACHES && (
              <p className="rounded-md border-2 border-ink bg-white/60 px-2.5 py-1 text-xs font-bold">
                You need to be 18 or older to coach for now.
              </p>
            )}
            <Link href="/signup/coach" className={`${secondaryButtonClass} mt-auto`}>
              Become a coach <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
