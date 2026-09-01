"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Sport } from "@/generated/prisma/client";
import { SPORT_LABELS } from "@/lib/sports";
import { calculatePriceBreakdown, formatCents } from "@/lib/money";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass, successClass } from "@/lib/ui";

type ChildOption = { id: string; firstName: string; gradeOrAge: string };

const DURATIONS = [30, 60, 90, 120];

export default function BookingForm({
  coach,
  childOptions,
  creditCents,
}: {
  coach: { id: string; name: string; hourlyRateCents: number; sports: Sport[] };
  childOptions: ChildOption[];
  creditCents: number;
}) {
  const router = useRouter();
  const [childList, setChildList] = useState(childOptions);
  const [showAddChild, setShowAddChild] = useState(childOptions.length === 0);
  const [newChildName, setNewChildName] = useState("");
  const [newChildGrade, setNewChildGrade] = useState("");
  const [addChildError, setAddChildError] = useState<string | null>(null);
  const [addChildLoading, setAddChildLoading] = useState(false);

  const [childId, setChildId] = useState(childOptions[0]?.id ?? "");
  const [sport, setSport] = useState<Sport | "">(coach.sports[0] ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [locationText, setLocationText] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ videoCallUrl: string | null } | null>(null);

  const breakdown = calculatePriceBreakdown(coach.hourlyRateCents, duration);
  const discountCents = Math.min(creditCents, breakdown.sessionCostCents);
  const totalDueCents = breakdown.totalChargedCents - discountCents;

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    setAddChildError(null);
    setAddChildLoading(true);
    const res = await fetch("/api/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: newChildName, gradeOrAge: newChildGrade }),
    });
    const data = await res.json();
    setAddChildLoading(false);
    if (!res.ok) {
      setAddChildError(data.error ?? "Something went wrong.");
      return;
    }
    setChildList((prev) => [...prev, data.child]);
    setChildId(data.child.id);
    setShowAddChild(false);
    setNewChildName("");
    setNewChildGrade("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!childId) {
      setError("Add or select a child for this session.");
      return;
    }
    if (!date || !time) {
      setError("Pick a date and time.");
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);
    setLoading(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coachProfileId: coach.id,
        childId,
        sport,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: duration,
        locationText,
        consent,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSuccess({ videoCallUrl: data.videoCallUrl ?? null });
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="card p-6">
          <p className={successClass}>Session booked with {coach.name}!</p>
          {success.videoCallUrl ? (
            <div className="mt-4 rounded-lg border-2 border-ink bg-muted p-4">
              <p className="font-display text-lg text-ink">First session? Hop on a quick video call first.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Meeting a new coach in person for the first time? We recommend a short video call beforehand.
                (Mock link — placeholder for a real video provider.)
              </p>
              <code className="mt-2 block break-all rounded bg-surface px-3 py-2 text-xs text-pitch">
                {success.videoCallUrl}
              </code>
            </div>
          ) : null}
          <button onClick={() => router.push("/dashboard")} className={`${primaryButtonClass} mt-4`}>
            Go to my dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="mb-1 font-display text-3xl text-ink">Book {coach.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        You choose the location — a park, school gym, or rec center. Never the coach&apos;s call.
      </p>

      {showAddChild ? (
        <form onSubmit={addChild} className="card mb-6 flex flex-col gap-4 p-5">
          <p className="font-display text-lg text-ink">Who&apos;s this session for?</p>
          {addChildError && <p className={errorClass}>{addChildError}</p>}
          <div>
            <label className={labelClass} htmlFor="childName">Child&apos;s first name</label>
            <input id="childName" className={inputClass} value={newChildName} onChange={(e) => setNewChildName(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="childGrade">Grade or age</label>
            <input id="childGrade" className={inputClass} placeholder="e.g. 5th grade or age 10" value={newChildGrade} onChange={(e) => setNewChildGrade(e.target.value)} required />
          </div>
          <div className="flex gap-3">
            <button type="submit" className={primaryButtonClass} disabled={addChildLoading}>
              {addChildLoading ? "Adding..." : "Add child"}
            </button>
            {childList.length > 0 && (
              <button type="button" className={secondaryButtonClass} onClick={() => setShowAddChild(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-5">
          {error && <p className={errorClass}>{error}</p>}

          <div>
            <label className={labelClass} htmlFor="child">Child</label>
            <div className="flex gap-2">
              <select id="child" className={inputClass} value={childId} onChange={(e) => setChildId(e.target.value)}>
                {childList.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} ({c.gradeOrAge})</option>
                ))}
              </select>
              <button type="button" className={secondaryButtonClass} onClick={() => setShowAddChild(true)}>
                + Add
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="sport">Sport</label>
            <select id="sport" className={inputClass} value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              {coach.sports.map((s) => (
                <option key={s} value={s}>{SPORT_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="date">Date</label>
              <input id="date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass} htmlFor="time">Time</label>
              <input id="time" type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="duration">Duration</label>
            <select id="duration" className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="location">Location</label>
            <input
              id="location"
              className={inputClass}
              placeholder="e.g. Zilker Park courts, or Northside Rec Center gym"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">Always a public spot — you pick it, not the coach.</p>
          </div>

          <div className="rounded-lg border-2 border-ink bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session cost</span>
              <span className="font-bold text-ink">{formatCents(breakdown.sessionCostCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-pitch">
                <span>Referral credit applied</span>
                <span className="font-bold">-{formatCents(discountCents)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t-2 border-ink pt-2 font-display text-lg text-ink">
              <span>Total due today</span>
              <span>{formatCents(totalDueCents)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Held securely until the session is marked complete, then released to the coach minus a 15% platform
              fee.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            I&apos;m the parent/guardian booking this session and I consent to my child meeting with this coach at
            the location above.
          </label>

          <button type="submit" className={primaryButtonClass} disabled={loading}>
            {loading ? "Booking..." : `Book & pay ${formatCents(totalDueCents)}`}
          </button>
        </form>
      )}
    </div>
  );
}
