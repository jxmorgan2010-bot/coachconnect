"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SkillLevel, Sport } from "@/generated/prisma/client";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass, successClass, quietLinkClass } from "@/lib/ui";
import { formatCents } from "@/lib/money";
import LevelPicker from "@/components/LevelPicker";
import { canMarkComplete, canReportNoShow, formatPacificDateTime, formatPacificTime, noShowOpensAt, sessionEndsAt } from "@/lib/sessionTiming";

// setTimeout can't wait longer than ~24.8 days; a page open that long just needs a reload.
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

function msUntil(instantMs: number): number {
  return Math.max(0, instantMs - Date.now());
}

/**
 * "Mark session complete" and "Coach didn't show" for a confirmed session, each shown only
 * once the server will accept it (see src/lib/sessionTiming.ts). Starts from the server's
 * clock so hydration matches, then re-renders itself when the next action opens, so a
 * parent waiting at the field doesn't have to reload.
 */
export function SessionTimingActions({
  bookingId,
  scheduledAt,
  durationMinutes,
  renderedAt,
}: {
  bookingId: string;
  scheduledAt: string;
  durationMinutes: number;
  renderedAt: string;
}) {
  const [now, setNow] = useState(() => new Date(renderedAt));
  const session = { scheduledAt: new Date(scheduledAt), durationMinutes };
  const noShowAt = noShowOpensAt(session);
  const endsAt = sessionEndsAt(session);
  const noShowOpen = canReportNoShow(session, now);
  const completeOpen = canMarkComplete(session, now);

  const nowMs = now.getTime();
  const noShowMs = noShowAt.getTime();
  const endsMs = endsAt.getTime();
  useEffect(() => {
    const next = [noShowMs, endsMs].find((t) => t > nowMs);
    if (next === undefined) return;
    const delay = msUntil(next);
    if (delay > MAX_TIMER_MS) return;
    const timer = setTimeout(() => setNow(new Date()), delay);
    return () => clearTimeout(timer);
  }, [nowMs, noShowMs, endsMs]);

  if (completeOpen) {
    return (
      <>
        <MarkCompleteButton bookingId={bookingId} />
        <NoShowButton bookingId={bookingId} />
      </>
    );
  }

  const endTime = formatPacificTime(endsAt);
  if (noShowOpen) {
    return (
      <>
        <NoShowButton bookingId={bookingId} />
        <p className="self-center text-sm text-muted-foreground">You can mark it complete after {endTime}.</p>
      </>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Coach not there by {formatPacificTime(noShowAt)}? You can report it here then. You can mark the session complete
      after {endTime}.
    </p>
  );
}

export function MarkCompleteButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/complete`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <p className={errorClass}>{error}</p>}
      <button onClick={onClick} className={primaryButtonClass} disabled={loading}>
        {loading ? "Saving..." : "Mark session complete"}
      </button>
    </div>
  );
}

export function NoShowButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <p role="status" className={successClass}>Reported. You won&apos;t be charged for this session, and an admin is reviewing the case.</p>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${secondaryButtonClass} text-danger`}>
        Coach didn&apos;t show
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/no-show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ details }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-danger/10 p-3">
      {error && <p className={errorClass}>{error}</p>}
      <p className="text-sm font-bold text-ink">Report that the coach didn&apos;t show</p>
      <p className="text-xs text-muted-foreground">
        This cancels the session right away. Any card hold is released, or the session goes back into your package.
        Our team will review the case.
      </p>
      <textarea
        className={inputClass}
        rows={2}
        aria-label="Details (optional)"
        placeholder="Any details? (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Submitting..." : "Confirm — coach didn't show"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function QuickRebookButton({
  bookingId,
  coachName,
  secondAdultName = null,
}: {
  bookingId: string;
  coachName: string;
  /** Set when the coach is a minor: quick rebook reuses the same second adult, so say who. */
  secondAdultName?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Set when the server asks for the child's level (LEVEL_REQUIRED): pick it here, save, retry.
  const [levelNeeded, setLevelNeeded] = useState<{ childId: string; sport: Sport; prompt: string } | null>(null);
  const [levelDraft, setLevelDraft] = useState<SkillLevel | null>(null);

  async function onClick() {
    setError(null);
    setErrorCode(null);
    setLoading(true);

    if (levelNeeded) {
      if (!levelDraft) {
        setLoading(false);
        setError("Choose a level first.");
        return;
      }
      const levelRes = await fetch(`/api/children/${levelNeeded.childId}/levels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: levelNeeded.sport, level: levelDraft }),
      });
      if (!levelRes.ok) {
        const levelData = await levelRes.json().catch(() => ({}));
        setLoading(false);
        setError(levelData.error ?? "We couldn't save the level. Try again.");
        return;
      }
      setLevelNeeded(null);
    }

    const res = await fetch("/api/bookings/quick-rebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      if (data.code === "LEVEL_REQUIRED" && data.childId && data.sport) {
        setLevelNeeded({ childId: data.childId, sport: data.sport, prompt: data.error });
        setLevelDraft(null);
        return;
      }
      setError(data.error ?? "Something went wrong.");
      setErrorCode(data.code ?? null);
      return;
    }
    setSuccess(formatPacificDateTime(new Date(data.scheduledAt)));
    router.refresh();
  }

  if (success) {
    return <p role="status" className={successClass}>Rebooked with {coachName} for {success}. You&apos;ll find it in your bookings.</p>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {error && <p className={errorClass}>{error}</p>}
      {errorCode === "LEVEL_NOT_ACCEPTED" && (
        <Link href="/dashboard/family" className={`${quietLinkClass} text-pitch`}>Update levels on your family page</Link>
      )}
      {levelNeeded && (
        <div className="w-full max-w-md">
          <LevelPicker
            name={`rebook-level-${bookingId}`}
            legend={levelNeeded.prompt}
            value={levelDraft}
            onChange={setLevelDraft}
          />
        </div>
      )}
      <button onClick={onClick} className={secondaryButtonClass} disabled={loading} aria-describedby={secondAdultName ? `rebook-adult-${bookingId}` : undefined}>
        {loading ? "Rebooking..." : levelNeeded ? "Save level and rebook" : `Quick rebook with ${coachName}`}
      </button>
      {secondAdultName && (
        <p id={`rebook-adult-${bookingId}`} className="max-w-xs text-xs text-muted-foreground">
          {coachName.split(" ")[0]} is under 18: you and {secondAdultName} both need to be there, same as last time.
          To bring a different adult, use the regular booking form.
        </p>
      )}
    </div>
  );
}

const TIP_PRESETS_CENTS = [300, 500, 1000];

export function TipForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customDollars, setCustomDollars] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedCents, setSubmittedCents] = useState<number | null>(null);

  if (submittedCents !== null) {
    return <p role="status" className={successClass}>Tip of {formatCents(submittedCents)} sent — 100% goes to your coach.</p>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Add a tip
      </button>
    );
  }

  async function submitTip(tipCents: number) {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipCents }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmittedCents(tipCents);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-accent/10 p-3">
      {error && <p className={errorClass}>{error}</p>}
      <p className="text-sm font-bold text-ink">Add a tip for your coach</p>
      <p className="text-xs text-muted-foreground">100% of your tip goes to the coach — no platform fee.</p>
      <div className="flex flex-wrap gap-2">
        {TIP_PRESETS_CENTS.map((cents) => (
          <button key={cents} type="button" disabled={loading} onClick={() => submitTip(cents)} className={secondaryButtonClass}>
            {formatCents(cents)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          step="0.01"
          aria-label="Custom tip amount in dollars"
          placeholder="Custom amount ($)"
          className={inputClass}
          value={customDollars}
          onChange={(e) => setCustomDollars(e.target.value)}
        />
        <button
          type="button"
          disabled={loading || !customDollars}
          className={primaryButtonClass}
          onClick={() => submitTip(Math.round(Number(customDollars) * 100))}
        >
          Send
        </button>
      </div>
      <button type="button" className={`${quietLinkClass} self-start text-muted-foreground`} onClick={() => setOpen(false)}>
        No thanks
      </button>
    </div>
  );
}

export function ProgressNoteForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [whatWorkedOn, setWhatWorkedOn] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Add progress note
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/progress-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatWorkedOn, nextFocus }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-lg border-2 border-ink bg-muted p-3">
      {error && <p className={errorClass}>{error}</p>}
      <div>
        <label className={labelClass} htmlFor={`note-${bookingId}-worked`}>What did you work on?</label>
        <textarea id={`note-${bookingId}-worked`} className={inputClass} rows={2} value={whatWorkedOn} onChange={(e) => setWhatWorkedOn(e.target.value)} required />
      </div>
      <div>
        <label className={labelClass} htmlFor={`note-${bookingId}-next`}>What to focus on next time (optional)</label>
        <textarea id={`note-${bookingId}-next`} className={inputClass} rows={2} value={nextFocus} onChange={(e) => setNextFocus(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Saving..." : "Save note"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
