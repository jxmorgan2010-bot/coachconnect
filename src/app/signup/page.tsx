import Link from "next/link";
import { IconUsers, IconWhistle, IconArrowRight } from "@/components/icons";

export default function SignupChooser() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 py-16 text-center sm:px-6">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Join CoachConnect</h1>
      <p className="max-w-xl text-muted-foreground">Tell us who you are so we can set up the right account.</p>

      <div className="grid w-full gap-6 sm:grid-cols-2">
        <Link
          href="/signup/parent"
          className="press flex flex-col items-start gap-3 rounded-xl border-2 border-ink bg-pitch p-8 text-left text-white shadow-[6px_6px_0_var(--ink)]"
        >
          <span className="grid h-12 w-12 place-items-center rounded-lg border-2 border-ink bg-white text-pitch">
            <IconUsers className="h-6 w-6" />
          </span>
          <h2 className="font-display text-2xl">I&apos;m a Parent or Guardian</h2>
          <p className="text-sm text-white/80">
            Browse coaches, book sessions for your child, message coaches, and leave reviews.
          </p>
          <span className="mt-1 flex items-center gap-1.5 font-display text-sm tracking-wide text-gold">
            Sign up as a parent <IconArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/signup/coach"
          className="press flex flex-col items-start gap-3 rounded-xl border-2 border-ink bg-gold p-8 text-left text-ink shadow-[6px_6px_0_var(--ink)]"
        >
          <span className="grid h-12 w-12 place-items-center rounded-lg border-2 border-ink bg-ink text-gold">
            <IconWhistle className="h-6 w-6" />
          </span>
          <h2 className="font-display text-2xl">I&apos;m a Student-Athlete</h2>
          <p className="text-sm text-ink/75">
            Build a coach profile, get verified, and start offering paid coaching sessions.
          </p>
          <span className="mt-1 flex items-center gap-1.5 font-display text-sm tracking-wide text-pitch">
            Sign up as a coach <IconArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-pitch">
          Log in
        </Link>
      </p>
    </div>
  );
}
