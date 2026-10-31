"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithPassword } from "@/lib/authClient";
import AuthLayout from "@/components/AuthLayout";
import { IconWhistle } from "@/components/icons";
import { inputClass, labelClass, goldButtonClass, errorClass, quietLinkClass } from "@/lib/ui";
import { PLATFORM_FEE_RATE } from "@/lib/money";
import { CONTACT_RULE_TEXT } from "@/lib/contactRule";
import type { CoachType } from "@/generated/prisma/client";

const COACH_TYPE_OPTIONS: { value: CoachType; label: string; description: string }[] = [
  {
    value: "STUDENT_ATHLETE",
    label: "Student-athlete",
    description: "You play in high school or college. You'll verify with your school ID.",
  },
  {
    value: "EXPERIENCED",
    label: "Experienced coach",
    description: "You're 18 or older and have played or coached. You'll verify with a driver's license, state ID or passport.",
  },
];

export default function CoachSignupForm({
  minorCoachesEnabled,
  experiencedCoachesEnabled,
  todayPacific,
}: {
  minorCoachesEnabled: boolean;
  experiencedCoachesEnabled: boolean;
  /** "YYYY-MM-DD" — the latest date of birth the date picker allows. */
  todayPacific: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [zip, setZip] = useState("");
  // With experienced coaches off there's nothing to choose.
  const [coachType, setCoachType] = useState<CoachType | null>(experiencedCoachesEnabled ? null : "STUDENT_ATHLETE");
  const [error, setError] = useState<string | null>(null);
  const [outOfArea, setOutOfArea] = useState(false);
  // Under 18 while the Minor Coach tier is off: a notice, not an error.
  const [notAcceptedYet, setNotAcceptedYet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOutOfArea(false);

    if (!coachType) {
      setError("Choose student-athlete or experienced coach.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, dateOfBirth, zip, coachType }),
      });
      const data = await res.json();
      if (data.code === "UNDER_18_NOT_ACCEPTED" || data.code === "EXPERIENCED_UNDER_18") {
        setNotAcceptedYet(data.error);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setOutOfArea(Boolean(data.outOfArea));
        setLoading(false);
        return;
      }

      const signInResult = await signInWithPassword(email, password);
      if (!signInResult.ok) {
        // The account exists; only the automatic sign-in failed.
        router.push("/login?created=1&callbackUrl=/onboarding/coach");
        return;
      }
      router.push("/onboarding/coach");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      panelColor="gold"
      panelIcon={<IconWhistle className="h-7 w-7" />}
      panelTitle="Set your rate. Coach your sport."
      panelPoints={[
        experiencedCoachesEnabled
          ? "Build a profile with your sport, your rate, and your school or coaching experience"
          : "Build a profile with your school, sport, and rate",
        "An admin approves your profile before families can find you",
        `A ${Math.round(PLATFORM_FEE_RATE * 100)}% platform fee comes out of each session price. During the beta, coach payouts aren't set up yet.`,
      ]}
    >
      <p className="eyebrow mb-2 text-pitch">Step 1 of onboarding</p>
      <h1 className="text-display-lg mb-2 font-display text-ink">Create a coach account</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Next you&apos;ll build your profile and finish verification before families can find you.
      </p>
      {/* Signup rejects under-18s while the Minor Coach tier is off — say so before they fill anything in */}
      {!minorCoachesEnabled ? (
        <p className="mb-6 rounded-lg border-2 border-ink bg-accent/15 px-3.5 py-2.5 text-sm font-bold text-ink">
          You need to be 18 or older to coach on Assist Coaching for now.
        </p>
      ) : (
        <p className="mb-6 rounded-lg border-2 border-ink bg-accent/15 px-3.5 py-2.5 text-sm text-ink">
          <span className="font-bold">Under 18?</span> You can apply from age 16. A parent or
          guardian will need to sign a consent form before your profile is reviewed.
        </p>
      )}

      {notAcceptedYet ? (
        <div role="status" className="flex flex-col items-start gap-4 rounded-xl border-2 border-ink bg-chalk p-5">
          <p className="font-display text-2xl leading-tight text-ink">Not quite yet</p>
          <p className="text-sm text-ink">{notAcceptedYet}</p>
          <p className="text-sm text-muted-foreground">We haven&apos;t saved anything you entered.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={goldButtonClass}>Back to Assist Coaching</Link>
            <button type="button" onClick={() => setNotAcceptedYet(null)} className={`${quietLinkClass} px-2 text-pitch`}>
              Wrong date of birth? Fix it
            </button>
          </div>
        </div>
      ) : (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className={errorClass}>
            {error}
            {outOfArea && (
              <>
                {" "}
                <Link href="/waitlist" className="underline">
                  Join the waitlist
                </Link>
                .
              </>
            )}
          </p>
        )}

        {experiencedCoachesEnabled && (
          <fieldset className="flex flex-col gap-2">
            <legend className={labelClass}>What kind of coach are you?</legend>
            {COACH_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border-2 border-line bg-surface px-3.5 py-2.5 hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-muted"
              >
                <input
                  type="radio"
                  name="coachType"
                  value={option.value}
                  checked={coachType === option.value}
                  onChange={() => setCoachType(option.value)}
                  required
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--pitch)]"
                />
                <span className="text-sm">
                  <span className="font-bold text-ink">{option.label}</span>
                  <span className="block text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div>
          <label className={labelClass} htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className={labelClass} htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              type="date"
              autoComplete="bday"
              className={inputClass}
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              max={todayPacific}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="zip">Zip code</label>
            <input
              id="zip"
              inputMode="numeric"
              autoComplete="postal-code"
              className={inputClass}
              placeholder="94103"
              maxLength={10}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              aria-describedby="zip-help"
              required
            />
          </div>
        </div>
        <p id="zip-help" className="-mt-2 text-xs text-muted-foreground">
          Bay Area only at launch — this needs to be a Bay Area zip code.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} aria-describedby="coach-password-help" />
          </div>

          <div>
            <label className={labelClass} htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
        </div>
        <p id="coach-password-help" className="-mt-2 text-xs text-muted-foreground">At least 8 characters.</p>

        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-ink">Community rule:</span> {CONTACT_RULE_TEXT}
        </p>

        <button type="submit" className={`${goldButtonClass} mt-2 w-full text-base`} disabled={loading}>
          {loading ? "Creating account..." : "Continue to profile setup"}
        </button>
      </form>
      )}

      <p className="mt-6 border-t-2 border-line pt-5 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
