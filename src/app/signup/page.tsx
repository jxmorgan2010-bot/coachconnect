import Link from "next/link";
import { IconUsers, IconWhistle, IconArrowRight } from "@/components/icons";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";

export default function SignupChooser() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-16">
      <p className="eyebrow mb-2 text-pitch">Bay Area</p>
      <h1 className="text-display-xl font-display text-ink">Join CoachConnect</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">Tell us who you are so we set up the right account.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 md:gap-8">
        <Link
          href="/signup/parent"
          className="on-dark press texture-hatch group flex flex-col items-start gap-4 rounded-xl border-2 border-ink bg-pitch p-6 text-white shadow-patch sm:p-8"
        >
          <span className="grid h-12 w-12 place-items-center rounded-lg border-2 border-ink bg-white text-pitch">
            <IconUsers className="h-6 w-6" />
          </span>
          <h2 className="text-display-md font-display">I&apos;m a parent or guardian</h2>
          <p className="text-white/85">
            Find a coach, book sessions for your kid, message coaches, and leave reviews.
          </p>
          <span className="mt-auto flex min-h-11 items-center gap-1.5 font-bold text-gold-bright group-hover:underline">
            Sign up as a parent <IconArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/signup/coach"
          className="press texture-hatch-dark group flex flex-col items-start gap-4 rounded-xl border-2 border-ink bg-gold p-6 text-ink shadow-patch sm:p-8"
        >
          <span className="grid h-12 w-12 place-items-center rounded-lg border-2 border-ink bg-ink text-gold">
            <IconWhistle className="h-6 w-6" />
          </span>
          <h2 className="text-display-md font-display">I&apos;m a student athlete</h2>
          <p className="text-ink/85">
            Build a coach profile, get your ID approved, and start offering paid sessions.
          </p>
          {/* Signup rejects under-18s while the Minor Coach tier is off — say so before the form */}
          {!ENABLE_MINOR_COACHES && (
            <p className="rounded-md border-2 border-ink bg-white/60 px-2.5 py-1 text-xs font-bold">
              You need to be 18 or older to coach for now.
            </p>
          )}
          <span className="mt-auto flex min-h-11 items-center gap-1.5 font-bold text-ink group-hover:underline">
            Sign up as a coach <IconArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:gap-8">
        <p>
          Already have an account?{" "}
          <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
        <p>
          Not in the Bay Area?{" "}
          <Link href="/waitlist" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
            Join the waitlist
          </Link>
        </p>
      </div>
    </div>
  );
}
