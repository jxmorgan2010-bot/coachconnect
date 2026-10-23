"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardNumberElement } from "@stripe/react-stripe-js";
import type { SkillLevel, Sport } from "@/generated/prisma/client";
import { SPORT_LABELS, SPORT_PLACE_EXAMPLE } from "@/lib/sports";
import { PUBLIC_PLACE_REQUIRED, VENUE_FEE_NOTE } from "@/lib/sessionPlace";
import { SKILL_LEVEL_LABELS, describeLevels, listLevels } from "@/lib/skillLevels";
import { calculatePriceBreakdown, formatCents } from "@/lib/money";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass, successClass, quietLinkClass } from "@/lib/ui";
import LevelPicker from "@/components/LevelPicker";
import CardSection from "./CardSection";
import CancellationPolicyNote from "./CancellationPolicyNote";
import LengthPicker from "@/components/LengthPicker";
import { DEFAULT_SESSION_LENGTH, SESSION_LENGTHS, lengthLabel, lengthOptions } from "@/lib/sessionLengths";

type ChildOption = { id: string; firstName: string; gradeOrAge: string; levels: Partial<Record<Sport, SkillLevel>> };
type OpenDay = { date: string; slots: { startsAt: string; label: string }[] };
type CoachInfo = {
  id: string;
  name: string;
  hourlyRateCents: number;
  sports: Sport[];
  /** Levels the coach takes, per sport they coach. */
  sportLevels: Partial<Record<Sport, SkillLevel[]>>;
  isMinorCoach: boolean;
};
type ActivePackage = { id: string; sport: Sport; durationMinutes: number; sessionsRemaining: number; childIdsUsed: string[] };


// Open times come from the server (/api/coaches/[id]/open-slots), computed with the same
// rules the server enforces when the booking is created: coach's posted Pacific hours,
// whole session fits, in the future, no overlap with any non-cancelled booking.
const SLOT_PAGE_DAYS = 28;

// Stripe's practical minimum charge in USD — must match the server's STRIPE_MIN_CENTS.
const STRIPE_MIN_CENTS = 50;

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

/** Calendar-date arithmetic on "YYYY-MM-DD" strings, timezone-free. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "Sat, Oct 17" for a Pacific calendar date, without any timezone shifting. */
function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BookingForm(props: { coach: CoachInfo; childOptions: ChildOption[]; creditCents: number; activePackage?: ActivePackage | null }) {
  return (
    <Elements stripe={stripePromise}>
      <BookingFormInner {...props} />
    </Elements>
  );
}

function BookingFormInner({
  coach,
  childOptions,
  creditCents,
  activePackage,
}: {
  coach: CoachInfo;
  childOptions: ChildOption[];
  creditCents: number;
  activePackage?: ActivePackage | null;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [childList, setChildList] = useState(childOptions);
  const [showAddChild, setShowAddChild] = useState(childOptions.length === 0);
  const [newChildName, setNewChildName] = useState("");
  const [newChildGrade, setNewChildGrade] = useState("");
  const [addChildError, setAddChildError] = useState<string | null>(null);
  const [addChildLoading, setAddChildLoading] = useState(false);

  const [childId, setChildId] = useState(childOptions[0]?.id ?? "");
  const [sport, setSport] = useState<Sport | "">(activePackage?.sport ?? coach.sports[0] ?? "");
  const [date, setDate] = useState("");
  // The exact UTC instant of the chosen slot, as returned by the server.
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<number>(activePackage?.durationMinutes ?? DEFAULT_SESSION_LENGTH);
  const [locationText, setLocationText] = useState("");
  const [zip, setZip] = useState("");
  const [consent, setConsent] = useState(false);
  const [secondAdultName, setSecondAdultName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ videoCallUrl: string | null } | null>(null);
  const [openDays, setOpenDays] = useState<OpenDay[]>([]);
  const [slotsFrom, setSlotsFrom] = useState<string | null>(null);
  const [nextFrom, setNextFrom] = useState<string | null>(null);
  // Which request the shown days belong to; "loading" is simply "not the current one yet".
  const [loadedSlotsKey, setLoadedSlotsKey] = useState<string | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [stripeSlowToLoad, setStripeSlowToLoad] = useState(false);
  // The level picker shows when the child has no level for this sport, or the parent hit "Change".
  const [editingLevel, setEditingLevel] = useState(false);
  const [levelDraft, setLevelDraft] = useState<SkillLevel | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const child = childList.find((c) => c.id === childId);
  const savedLevel = sport && child ? child.levels[sport] : undefined;
  const acceptedLevels = sport ? coach.sportLevels[sport] : undefined;
  const showLevelPicker = Boolean(child && sport) && (!savedLevel || editingLevel);
  const levelGrandfathered = Boolean(activePackage?.childIdsUsed.includes(childId));
  function levelMismatchFor(level: SkillLevel | undefined) {
    return Boolean(level && acceptedLevels && !acceptedLevels.includes(level) && !levelGrandfathered);
  }
  const levelMismatch = !showLevelPicker && levelMismatchFor(savedLevel);
  const sportName = sport ? SPORT_LABELS[sport].toLowerCase() : "";

  function levelMismatchMessage(level: SkillLevel) {
    return `${coach.name.split(" ")[0]} takes ${listLevels(acceptedLevels ?? [])} ${sportName} players, and ${child?.firstName} is set to ${SKILL_LEVEL_LABELS[level]}.`;
  }

  function changeChildOrSport() {
    setEditingLevel(false);
    setLevelDraft(null);
  }

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  useEffect(() => {
    const timer = setTimeout(() => setStripeSlowToLoad(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  const breakdown = calculatePriceBreakdown(coach.hourlyRateCents, duration);
  const discountCents = Math.min(creditCents, breakdown.sessionCostCents);
  const totalDueCents = breakdown.totalChargedCents - discountCents;
  const paymentRequired = !activePackage && totalDueCents >= STRIPE_MIN_CENTS;

  const slotsKey = `${duration}|${slotsFrom ?? ""}|${slotsVersion}`;
  const slotsLoading = loadedSlotsKey !== slotsKey;

  useEffect(() => {
    let cancelled = false;
    const key = `${duration}|${slotsFrom ?? ""}|${slotsVersion}`;
    const params = new URLSearchParams({ duration: String(duration), days: String(SLOT_PAGE_DAYS) });
    if (slotsFrom) params.set("from", slotsFrom);
    fetch(`/api/coaches/${coach.id}/open-slots?${params}`)
      .then((res) => (res.ok ? res.json() : { days: [], nextFrom: null }))
      .then((data) => {
        if (cancelled) return;
        setOpenDays(data.days ?? []);
        setNextFrom(data.nextFrom ?? null);
        setLoadedSlotsKey(key);
      })
      .catch(() => {
        if (!cancelled) setLoadedSlotsKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [coach.id, duration, slotsFrom, slotsVersion]);

  const daySlots = useMemo(() => openDays.find((d) => d.date === date)?.slots ?? [], [openDays, date]);

  // True once the chosen time is no longer offered (duration changed, or someone else took it).
  const timeNoLongerValid = Boolean(time) && !daySlots.some((s) => s.startsAt === time);

  function refreshSlotsIfTimeRejected(status: number) {
    if (status === 409 || status === 400) {
      setSlotsVersion((v) => v + 1);
      if (status === 409) setTime("");
    }
  }

  function pickDay(next: string) {
    setDate(next);
    setTime("");
  }

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
    setChildList((prev) => [...prev, { ...data.child, levels: {} }]);
    setChildId(data.child.id);
    changeChildOrSport();
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
    if (!time) {
      setError("Pick a date and time.");
      return;
    }
    if (timeNoLongerValid) {
      setError("That time is no longer available — pick another.");
      return;
    }
    if (locationText.trim().length < 5) {
      setError(PUBLIC_PLACE_REQUIRED);
      return;
    }
    if (coach.isMinorCoach && secondAdultName.trim().length < 2) {
      setError("This coach is under 18, so you and a second adult both need to be at the session. Enter the second adult's name.");
      return;
    }
    if (paymentRequired && zip.trim().length < 5) {
      setError("Enter your card's billing zip code.");
      return;
    }

    // Save the child's level first if it was just picked or changed, then stop before any
    // card hold if the coach doesn't take it. The server checks again either way.
    if (showLevelPicker && sport) {
      if (!levelDraft) {
        setError(`Choose ${child?.firstName}'s ${sportName} level.`);
        return;
      }
      setLoading(true);
      const levelRes = await fetch(`/api/children/${childId}/levels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, level: levelDraft }),
      });
      const levelData = await levelRes.json().catch(() => ({}));
      if (!levelRes.ok) {
        setLoading(false);
        setError(levelData.error ?? "We couldn't save the level. Try again.");
        return;
      }
      const saved = levelDraft;
      setChildList((prev) => prev.map((c) => (c.id === childId ? { ...c, levels: { ...c.levels, [sport]: saved } } : c)));
      setEditingLevel(false);
      if (levelMismatchFor(saved)) {
        setLoading(false);
        setError(levelMismatchMessage(saved));
        return;
      }
    } else if (levelMismatch && savedLevel) {
      setError(levelMismatchMessage(savedLevel));
      return;
    }

    const scheduledAt = new Date(time);
    const basePayload = {
      coachProfileId: coach.id,
      childId,
      sport,
      scheduledAt: scheduledAt.toISOString(),
      durationMinutes: duration,
      locationText,
      consent,
      secondAdultName: coach.isMinorCoach ? secondAdultName.trim() : undefined,
      packageId: activePackage?.id,
    };

    setLoading(true);

    if (activePackage) {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        refreshSlotsIfTimeRejected(res.status);
        return;
      }
      setSuccess({ videoCallUrl: data.videoCallUrl ?? null });
      return;
    }

    const intentRes = await fetch("/api/bookings/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basePayload),
    });
    const intentData = await intentRes.json();
    if (!intentRes.ok) {
      setLoading(false);
      setError(intentData.error ?? "Something went wrong.");
      refreshSlotsIfTimeRejected(intentRes.status);
      return;
    }

    let paymentIntentId: string | undefined;

    if (!intentData.noPaymentRequired) {
      if (!stripe || !elements) {
        setLoading(false);
        setError("The payment form isn't ready yet — please wait a moment and try again.");
        return;
      }
      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) {
        setLoading(false);
        setError("Enter your card details.");
        return;
      }
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: { address: { postal_code: zip.trim() } },
        },
      });
      if (stripeError) {
        setLoading(false);
        setError(stripeError.message ?? "Your card couldn't be authorized.");
        return;
      }
      paymentIntentId = paymentIntent?.id;
    }

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, paymentIntentId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      refreshSlotsIfTimeRejected(res.status);
      return;
    }
    setSuccess({ videoCallUrl: data.videoCallUrl ?? null });
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="card p-6 sm:p-8">
          <p className="eyebrow mb-3 text-pitch">Booked</p>
          <h1 className="text-display-md font-display text-ink">You&apos;re on {coach.name}&apos;s calendar</h1>
          <p className="mt-3 text-muted-foreground">
            You&apos;ll find the time, place, and payment details on your dashboard.
          </p>
          {/* success.videoCallUrl is a mock placeholder link, so it isn't shown until a real provider exists. */}
          <button onClick={() => router.push("/dashboard")} className={`${primaryButtonClass} mt-6 w-full sm:w-auto`}>
            Go to my dashboard
          </button>
        </div>
      </div>
    );
  }

  const sectionClass = "flex flex-col gap-4 border-t-2 border-line pt-6 first-of-type:border-t-0 first-of-type:pt-0";
  // float takes the legend out of the fieldset border so it lays out like a normal heading
  const legendClass = "float-left mb-1 flex w-full items-baseline gap-2.5 font-display text-2xl leading-none text-ink";
  const stepClass = "font-display text-base text-pitch";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="eyebrow mb-2 text-pitch">Book a session</p>
      <h1 className="text-display-lg font-display text-ink">Book {coach.name}</h1>
      <p className="mt-2 text-muted-foreground">
        {formatCents(coach.hourlyRateCents).replace(".00", "")}/hr · You choose where you meet — a park, a school or rec
        center gym, or a dojo or boxing gym.
      </p>

      {activePackage && (
        <p className="mt-5 rounded-lg border-2 border-ink bg-accent/15 px-4 py-3 text-sm font-bold text-ink">
          Booking from your package — {activePackage.sessionsRemaining} session{activePackage.sessionsRemaining === 1 ? "" : "s"} left, no charge today.
        </p>
      )}

      <div className="mt-6">
        {showAddChild ? (
          <form onSubmit={addChild} className="card flex flex-col gap-4 p-5 sm:p-6">
            <h2 className="font-display text-2xl leading-none text-ink">Who&apos;s this session for?</h2>
            {addChildError && <p role="alert" className={errorClass}>{addChildError}</p>}
            <div>
              <label className={labelClass} htmlFor="childName">Child&apos;s first name</label>
              <input id="childName" className={inputClass} value={newChildName} onChange={(e) => setNewChildName(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass} htmlFor="childGrade">Grade or age</label>
              <input id="childGrade" className={inputClass} placeholder="e.g. 5th grade or age 10" value={newChildGrade} onChange={(e) => setNewChildGrade(e.target.value)} required />
            </div>
            <div className="flex flex-wrap gap-3">
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
          <form onSubmit={onSubmit} className="card flex flex-col gap-6 p-5 sm:p-6">
            {error && (
              <p ref={errorRef} role="alert" className={errorClass}>
                {error}
              </p>
            )}

            {/* The four steps really are a sequence, so they're numbered */}
            <fieldset className={sectionClass}>
              <legend className={legendClass}>
                <span className={stepClass} aria-hidden>01</span> Who and what
              </legend>
              <div>
                <label className={labelClass} htmlFor="child">Child</label>
                <div className="flex gap-2">
                  <select
                    id="child"
                    className={inputClass}
                    value={childId}
                    onChange={(e) => {
                      setChildId(e.target.value);
                      changeChildOrSport();
                    }}
                  >
                    {childList.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} ({c.gradeOrAge})</option>
                    ))}
                  </select>
                  <button type="button" className={`${secondaryButtonClass} shrink-0 px-4`} onClick={() => setShowAddChild(true)}>
                    + Add child
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="sport">Sport</label>
                <select
                  id="sport"
                  className={inputClass}
                  value={sport}
                  disabled={!!activePackage}
                  aria-describedby={acceptedLevels ? "sport-levels" : undefined}
                  onChange={(e) => {
                    setSport(e.target.value as Sport);
                    changeChildOrSport();
                  }}
                >
                  {coach.sports.map((s) => (
                    <option key={s} value={s}>{SPORT_LABELS[s]}</option>
                  ))}
                </select>
                {acceptedLevels && (
                  <p id="sport-levels" className="mt-1.5 text-xs text-muted-foreground">
                    {coach.name.split(" ")[0]} takes: {describeLevels(acceptedLevels)}
                  </p>
                )}
              </div>

              {child && sport && (
                showLevelPicker ? (
                  <div className="flex flex-col gap-2">
                    <LevelPicker
                      name="childLevel"
                      legend={`${child.firstName}'s ${sportName} level`}
                      value={levelDraft}
                      onChange={setLevelDraft}
                      accepted={levelGrandfathered ? undefined : acceptedLevels}
                    />
                    <p className="text-xs text-muted-foreground">
                      Saved to {child.firstName}&apos;s profile for next time. You can change it on your family page.
                    </p>
                    {editingLevel && (
                      <button
                        type="button"
                        className={`${quietLinkClass} self-start text-pitch`}
                        onClick={changeChildOrSport}
                      >
                        Keep {savedLevel ? SKILL_LEVEL_LABELS[savedLevel] : "the saved level"}
                      </button>
                    )}
                  </div>
                ) : (
                  savedLevel && (
                    <div
                      className={`flex flex-col gap-1 rounded-lg border-2 px-3.5 py-2.5 text-sm ${
                        levelMismatch ? "border-danger bg-danger/10" : "border-line"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3">
                        <p className="text-ink">
                          {child.firstName}&apos;s {sportName} level: <span className="font-bold">{SKILL_LEVEL_LABELS[savedLevel]}</span>
                        </p>
                        <button
                          type="button"
                          className={`${quietLinkClass} text-pitch`}
                          onClick={() => {
                            setLevelDraft(savedLevel);
                            setEditingLevel(true);
                          }}
                        >
                          Change<span className="sr-only"> {child.firstName}&apos;s level</span>
                        </button>
                      </div>
                      {levelMismatch && (
                        <>
                          <p className="font-semibold text-danger">
                            {levelMismatchMessage(savedLevel)} You can&apos;t book this coach at that level.
                          </p>
                          <Link
                            href={`/coaches?sport=${sport}&level=${savedLevel}`}
                            className={`${quietLinkClass} self-start text-pitch`}
                          >
                            See {sportName} coaches who take {SKILL_LEVEL_LABELS[savedLevel]} players
                          </Link>
                        </>
                      )}
                    </div>
                  )
                )
              )}
            </fieldset>

            <fieldset className={sectionClass}>
              <legend className={legendClass}>
                <span className={stepClass} aria-hidden>02</span> When
              </legend>
              {activePackage ? (
                <p className="text-sm text-ink">
                  <span className="font-bold">Length:</span> {lengthLabel(activePackage.durationMinutes)}, set by your package.
                </p>
              ) : (
                <div className="sm:max-w-md">
                  <LengthPicker
                    name="duration"
                    legend={
                      <>
                        Length{" "}
                        <span className="font-normal text-muted-foreground">
                          · {coach.name.split(" ")[0]}&apos;s rate is {formatCents(coach.hourlyRateCents)}/hr
                        </span>
                      </>
                    }
                    options={lengthOptions(coach.hourlyRateCents).map((o) => ({ ...o, price: formatCents(o.priceCents) }))}
                    value={duration}
                    onChange={(minutes) => {
                      setDuration(minutes);
                      setTime("");
                    }}
                  />
                </div>
              )}

              <div role="group" aria-labelledby="day-label">
                <p id="day-label" className={labelClass}>Day</p>
                {slotsLoading ? (
                  <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
                    Loading open times...
                  </p>
                ) : openDays.length === 0 ? (
                  <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
                    No open times for a {lengthLabel(duration)} session in these four weeks.
                    {!activePackage && duration > SESSION_LENGTHS[0]
                      ? " A shorter session may fit, or try later dates."
                      : " Try later dates, or message the coach."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {openDays.map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        aria-pressed={date === d.date}
                        onClick={() => pickDay(d.date)}
                        className={`min-h-11 rounded-lg border-2 px-3 text-sm font-bold ${
                          date === d.date
                            ? "border-ink bg-ink text-white shadow-patch-xs"
                            : "border-ink bg-surface text-ink hover:bg-gold-bright/40"
                        }`}
                      >
                        {dayLabel(d.date)}
                        <span className={`ml-1.5 text-xs font-normal ${date === d.date ? "text-white/80" : "text-muted-foreground"}`}>
                          {d.slots.length} open
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-x-5">
                  {slotsFrom && (
                    <button
                      type="button"
                      className={`${quietLinkClass} text-pitch`}
                      onClick={() => {
                        setSlotsFrom(shiftDate(slotsFrom, -SLOT_PAGE_DAYS));
                        pickDay("");
                      }}
                    >
                      ← Earlier dates
                    </button>
                  )}
                  {nextFrom && !slotsLoading && (
                    <button
                      type="button"
                      className={`${quietLinkClass} text-pitch`}
                      onClick={() => {
                        setSlotsFrom(nextFrom);
                        pickDay("");
                      }}
                    >
                      Later dates →
                    </button>
                  )}
                </div>
              </div>

              <div role="group" aria-labelledby="time-label">
                <p id="time-label" className={labelClass}>
                  Start time <span className="font-normal text-muted-foreground">(Pacific time)</span>
                </p>
                {!date ? (
                  <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
                    Pick a day to see open times.
                  </p>
                ) : daySlots.length === 0 ? (
                  <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
                    That day just filled up. Pick another day.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {daySlots.map((slot) => (
                      <button
                        key={slot.startsAt}
                        type="button"
                        aria-pressed={time === slot.startsAt}
                        onClick={() => setTime(slot.startsAt)}
                        className={`min-h-11 rounded-lg border-2 px-1 text-sm font-bold ${
                          time === slot.startsAt
                            ? "border-ink bg-ink text-white shadow-patch-xs"
                            : "border-ink bg-surface text-ink hover:bg-gold-bright/40"
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                )}
                {timeNoLongerValid && (
                  <p className="mt-2 text-sm font-bold text-danger">That time isn&apos;t available anymore. Pick another.</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Only times inside {coach.name.split(" ")[0]}&apos;s posted hours that fit the whole session are shown.
                </p>
              </div>
            </fieldset>

            <fieldset className={sectionClass}>
              <legend className={legendClass}>
                <span className={stepClass} aria-hidden>03</span> Where
              </legend>
              <div>
                <label className={labelClass} htmlFor="location">Location</label>
                <input
                  id="location"
                  className={inputClass}
                  placeholder={sport ? SPORT_PLACE_EXAMPLE[sport] : "e.g. the rec center gym"}
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  aria-describedby="location-help"
                  required
                />
                <p id="location-help" className="mt-1.5 text-xs text-muted-foreground">
                  Pick a public place: a park, a school or rec center gym, or a dojo or boxing gym open to the
                  public. You choose — not the coach. Never a private home. {VENUE_FEE_NOTE}
                </p>
              </div>

              {coach.isMinorCoach && (
                <div className="rounded-lg border-2 border-ink bg-accent/10 p-4">
                  <p className="font-display text-lg leading-tight text-ink">Two adults at this session</p>
                  <p id="second-adult-help" className="mt-1 text-sm text-ink">
                    {coach.name.split(" ")[0]} is under 18, so for every session:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-ink">
                    <li>you, the parent booking, stay for the whole session, and</li>
                    <li>one more adult (18 or older) is there too.</li>
                  </ul>
                  <label className={`${labelClass} mt-3`} htmlFor="secondAdultName">Second adult&apos;s full name</label>
                  <input
                    id="secondAdultName"
                    className={inputClass}
                    placeholder="Someone other than you"
                    value={secondAdultName}
                    onChange={(e) => setSecondAdultName(e.target.value)}
                    aria-describedby="second-adult-help"
                    required
                  />
                </div>
              )}
            </fieldset>

            <fieldset className={sectionClass}>
              <legend className={legendClass}>
                <span className={stepClass} aria-hidden>04</span> {activePackage ? "Confirm" : "Pay"}
              </legend>

              {activePackage ? (
                <p className={successClass}>Included in your package — no charge for this session.</p>
              ) : (
                // Receipt: dashed rules, totals in display type
                <div className="rounded-lg border-2 border-ink bg-chalk p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Session cost ({lengthLabel(duration)})</span>
                    <span className="font-bold text-ink">{formatCents(breakdown.sessionCostCents)}</span>
                  </div>
                  {discountCents > 0 && (
                    <div className="mt-1 flex justify-between gap-4 text-pitch">
                      <span>Referral credit applied</span>
                      <span className="font-bold">-{formatCents(discountCents)}</span>
                    </div>
                  )}
                  <div className="mt-3 flex items-baseline justify-between gap-4 border-t-2 border-dashed border-ink pt-3 text-ink">
                    <span className="font-display text-lg leading-none">Card hold today</span>
                    <span className="font-display text-2xl leading-none">{formatCents(totalDueCents)}</span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Your card is authorized (held), not charged, when you book. It&apos;s charged when you mark the
                    session complete, or if you cancel after the free-cancellation deadline. The price includes
                    CoachConnect&apos;s 15% platform fee — nothing is added on top. Card/digital payment only.
                  </p>
                </div>
              )}

              {!activePackage && (
                paymentRequired ? (
                  stripe && elements ? (
                    <CardSection zip={zip} onZipChange={setZip} />
                  ) : stripeSlowToLoad ? (
                    <p className={errorClass}>
                      Payments aren&apos;t configured — add STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
                      (test-mode keys from your Stripe dashboard) to .env and restart the server.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading payment form...</p>
                  )
                ) : (
                  <p className={successClass}>Fully covered by your referral credit — no card needed for this booking.</p>
                )
              )}

              <CancellationPolicyNote startsAt={time} isPackage={!!activePackage} />

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-line bg-surface p-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--pitch)]"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                <span>
                  I&apos;m the parent/guardian booking this session and I consent to my child meeting with this coach at
                  the location above.
                </span>
              </label>
            </fieldset>

            {error && <p className={errorClass}>{error}</p>}

            <button type="submit" className={`${primaryButtonClass} w-full text-base`} disabled={loading || levelMismatch}>
              {loading ? "Booking..." : paymentRequired ? `Book & hold ${formatCents(totalDueCents)}` : "Book session"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
