"use client";

import { useState } from "react";
import Link from "next/link";
import type { Sport } from "@/generated/prisma/client";
import { SPORTS, SPORT_LABELS, SPORT_TAG, SPORT_COLOR } from "@/lib/sports";
import { gradYearOptions } from "@/lib/teenInterest";
import { inputClass, labelClass, goldButtonClass, errorClass, quietLinkClass, successClass } from "@/lib/ui";

/** Shown on coach signup (banner and panel) while coaches must be 18+. */
export const TEEN_INTEREST_TEXT =
  "Coaches must be 18 or older for now. Under 18? Join the interest list and we'll email you when we can welcome younger coaches.";

/**
 * The teen interest list (src/lib/teenInterest.ts): no account and no password. Reached from the
 * signup banner, or when signup finds the person is 16 or 17 (then name, email and date of birth
 * carry over).
 */
export default function TeenInterestForm({
  initial,
  todayPacific,
  onBackToSignup,
  onTooYoung,
}: {
  initial: { firstName: string; email: string; dateOfBirth: string };
  /** "YYYY-MM-DD" */
  todayPacific: string;
  onBackToSignup: () => void;
  /** Under the minimum age: signup's usual "not quite yet" notice, with this text. */
  onTooYoung: (reason: string) => void;
}) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [email, setEmail] = useState(initial.email);
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [sports, setSports] = useState<Sport[]>([]);
  const [school, setSchool] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdult, setIsAdult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  const years = gradYearOptions(Number(todayPacific.slice(0, 4)));

  function toggleSport(sport: Sport) {
    setSports((current) => (current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsAdult(false);
    if (sports.length === 0) {
      setError("Pick at least one sport.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/teen-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email, dateOfBirth, sports, school, gradYear, parentEmail }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (data.code === "TOO_YOUNG") {
        onTooYoung(data.error);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setIsAdult(data.code === "ADULT" || data.code === "MINOR_COACHES_OPEN");
        return;
      }
      setDoneEmail(email.trim());
      window.scrollTo({ top: 0 });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (doneEmail) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="eyebrow text-pitch">Teen interest list</p>
        <h1 className="text-display-lg font-display text-ink">You&apos;re on the list</h1>
        <p role="status" className={successClass}>
          We&apos;ll email {doneEmail} when we can welcome younger coaches.
        </p>
        <p className="text-sm text-muted-foreground">
          Check that inbox for a confirmation. It has a link to take yourself off the list any time.
        </p>
        <Link href="/" className={goldButtonClass}>Back to Assist Coaching</Link>
      </div>
    );
  }

  return (
    <>
      <p className="eyebrow mb-2 text-pitch">Under 18</p>
      <h1 className="text-display-lg mb-3 font-display text-ink">Join the interest list</h1>
      <p className="mb-2 text-sm text-ink">{TEEN_INTEREST_TEXT}</p>
      <p className="mb-6 text-sm text-muted-foreground">No account and no password. We keep only what you enter here.</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className={errorClass}>
            {error}
            {isAdult && (
              <>
                {" "}
                <button type="button" onClick={onBackToSignup} className="relative underline after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']">
                  Go to coach signup
                </button>
              </>
            )}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ti-firstName">First name</label>
            <input id="ti-firstName" autoComplete="given-name" className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={50} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ti-dateOfBirth">Date of birth</label>
            <input
              id="ti-dateOfBirth"
              type="date"
              autoComplete="bday"
              className={inputClass}
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              max={todayPacific}
              required
              aria-describedby="ti-dob-help"
            />
          </div>
        </div>
        <p id="ti-dob-help" className="-mt-2 text-xs text-muted-foreground">
          We use it to check your age, then keep only the date you turn 18.
        </p>

        <div>
          <label className={labelClass} htmlFor="ti-email">Your email</label>
          <input id="ti-email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div role="group" aria-labelledby="ti-sports-label">
          <p id="ti-sports-label" className={labelClass}>Sports you&apos;d coach</p>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((sport) => {
              const selected = sports.includes(sport);
              const c = SPORT_COLOR[sport];
              return (
                <button
                  type="button"
                  key={sport}
                  aria-pressed={selected}
                  onClick={() => toggleSport(sport)}
                  className={`flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 text-sm font-bold ${
                    selected ? "border-ink shadow-patch-xs" : "border-line bg-surface text-ink hover:border-ink"
                  }`}
                  style={selected ? { background: c.bg, color: c.fg } : undefined}
                >
                  <span className="font-display tracking-wide" aria-hidden="true">{SPORT_TAG[sport]}</span>
                  {SPORT_LABELS[sport]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div>
            <label className={labelClass} htmlFor="ti-school">School</label>
            <input id="ti-school" autoComplete="organization" className={inputClass} value={school} onChange={(e) => setSchool(e.target.value)} required maxLength={100} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ti-gradYear">Graduation year</label>
            <select id="ti-gradYear" className={inputClass} value={gradYear} onChange={(e) => setGradYear(e.target.value)} required>
              <option value="">Choose</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="ti-parentEmail">
            Parent or guardian email <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="ti-parentEmail"
            type="email"
            className={inputClass}
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            aria-describedby="ti-parent-help"
          />
          <p id="ti-parent-help" className="mt-1.5 text-xs text-muted-foreground">We won&apos;t email them now.</p>
        </div>

        <button type="submit" className={`${goldButtonClass} mt-2 w-full text-base`} disabled={loading}>
          {loading ? "Joining..." : "Join the interest list"}
        </button>
        <button type="button" onClick={onBackToSignup} className={`${quietLinkClass} self-start text-pitch`}>
          18 or older? Back to coach signup
        </button>
      </form>
    </>
  );
}
