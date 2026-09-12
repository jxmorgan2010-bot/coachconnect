"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardNumberElement } from "@stripe/react-stripe-js";
import type { Sport } from "@/generated/prisma/client";
import { SPORT_LABELS } from "@/lib/sports";
import { calculatePriceBreakdown, formatCents } from "@/lib/money";
import { rangesOverlap } from "@/lib/bookingConflicts";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass, successClass } from "@/lib/ui";
import CardSection from "./CardSection";

type ChildOption = { id: string; firstName: string; gradeOrAge: string };
type BookedSlot = { scheduledAt: string; durationMinutes: number };
type CoachInfo = { id: string; name: string; hourlyRateCents: number; sports: Sport[]; isMinorCoach: boolean };

const DURATIONS = [30, 60, 90, 120];

// Candidate start times shown on the picker: every 30 minutes, 7am to 9pm.
const SLOT_START_MINUTE = 7 * 60;
const SLOT_END_MINUTE = 21 * 60;
const SLOT_STEP_MINUTES = 30;

// Stripe's practical minimum charge in USD — must match the server's STRIPE_MIN_CENTS.
const STRIPE_MIN_CENTS = 50;

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function minutesToLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function minutesToTimeValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function BookingForm(props: { coach: CoachInfo; childOptions: ChildOption[]; creditCents: number }) {
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
}: {
  coach: CoachInfo;
  childOptions: ChildOption[];
  creditCents: number;
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
  const [sport, setSport] = useState<Sport | "">(coach.sports[0] ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [locationText, setLocationText] = useState("");
  const [zip, setZip] = useState("");
  const [consent, setConsent] = useState(false);
  const [secondAdultName, setSecondAdultName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ videoCallUrl: string | null } | null>(null);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [stripeSlowToLoad, setStripeSlowToLoad] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

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
  const paymentRequired = totalDueCents >= STRIPE_MIN_CENTS;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/coaches/${coach.id}/booked-times`)
      .then((res) => (res.ok ? res.json() : { slots: [] }))
      .then((data) => {
        if (!cancelled) setBookedSlots(data.slots ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [coach.id]);

  // Booked ranges that fall on the selected date, converted to local Date objects.
  const bookedRangesForDate = useMemo(() => {
    if (!date) return [];
    return bookedSlots
      .map((s) => ({ start: new Date(s.scheduledAt), durationMinutes: s.durationMinutes }))
      .filter((s) => {
        const y = s.start.getFullYear();
        const m = String(s.start.getMonth() + 1).padStart(2, "0");
        const d = String(s.start.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}` === date;
      });
  }, [bookedSlots, date]);

  const timeSlots = useMemo(() => {
    if (!date) return [];
    const now = new Date();
    const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const slots: { value: string; label: string; disabled: boolean }[] = [];
    for (let m = SLOT_START_MINUTE; m <= SLOT_END_MINUTE; m += SLOT_STEP_MINUTES) {
      const slotStart = new Date(`${date}T${minutesToTimeValue(m)}`);
      const inPast = isToday && slotStart.getTime() <= now.getTime();
      const booked = bookedRangesForDate.some((b) => rangesOverlap(slotStart, duration, b.start, b.durationMinutes));
      slots.push({ value: minutesToTimeValue(m), label: minutesToLabel(m), disabled: inPast || booked });
    }
    return slots;
  }, [date, duration, bookedRangesForDate]);

  // True once the chosen time is no longer a valid, available slot (e.g. duration changed after picking it).
  const timeNoLongerValid = Boolean(time) && !timeSlots.some((s) => s.value === time && !s.disabled);

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
    if (timeNoLongerValid) {
      setError("That time is no longer available — pick another.");
      return;
    }
    if (locationText.trim().length < 5) {
      setError("Enter a public location, like a park or rec center.");
      return;
    }
    if (coach.isMinorCoach && secondAdultName.trim().length < 2) {
      setError("This coach is under 18 — enter the name of a second adult who'll be present.");
      return;
    }
    if (paymentRequired && zip.trim().length < 5) {
      setError("Enter your card's billing zip code.");
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);
    const basePayload = {
      coachProfileId: coach.id,
      childId,
      sport,
      scheduledAt: scheduledAt.toISOString(),
      durationMinutes: duration,
      locationText,
      consent,
      secondAdultName: coach.isMinorCoach ? secondAdultName.trim() : undefined,
    };

    setLoading(true);

    const intentRes = await fetch("/api/bookings/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basePayload),
    });
    const intentData = await intentRes.json();
    if (!intentRes.ok) {
      setLoading(false);
      setError(intentData.error ?? "Something went wrong.");
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
          {error && (
            <p ref={errorRef} className={errorClass}>
              {error}
            </p>
          )}

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
              <label className={labelClass} htmlFor="duration">Duration</label>
              <select id="duration" className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Time</label>
            {!date ? (
              <p className="text-sm text-muted-foreground">Pick a date to see open times.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {timeSlots.map((slot) => (
                  <button
                    key={slot.value}
                    type="button"
                    disabled={slot.disabled}
                    onClick={() => setTime(slot.value)}
                    className={`rounded-lg border-2 border-ink px-2 py-2 text-xs font-bold ${
                      slot.disabled
                        ? "cursor-not-allowed bg-muted text-muted-foreground opacity-50 line-through"
                        : time === slot.value
                          ? "bg-ink text-white"
                          : "bg-surface text-ink hover:bg-muted"
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
            {date && bookedRangesForDate.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Greyed-out times are already booked with this coach.</p>
            )}
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

          {coach.isMinorCoach && (
            <div>
              <label className={labelClass} htmlFor="secondAdultName">Second adult present</label>
              <input
                id="secondAdultName"
                className={inputClass}
                placeholder="Name of the additional adult who'll be at the session"
                value={secondAdultName}
                onChange={(e) => setSecondAdultName(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This coach is under 18. CoachConnect requires a second adult — beyond you, the booking parent — to
                be present at every session with a minor coach.
              </p>
            </div>
          )}

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
              <span>Card hold today</span>
              <span>{formatCents(totalDueCents)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Your card is authorized (held), not charged, when you book. It&apos;s only captured after you mark the
              session complete — minus a 15% platform fee to the coach&apos;s payout. Card/digital payment only.
            </p>
          </div>

          {paymentRequired ? (
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
          )}

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            I&apos;m the parent/guardian booking this session and I consent to my child meeting with this coach at
            the location above.
          </label>

          {error && <p className={errorClass}>{error}</p>}

          <button type="submit" className={primaryButtonClass} disabled={loading}>
            {loading ? "Booking..." : paymentRequired ? `Book & hold ${formatCents(totalDueCents)}` : "Book session"}
          </button>
        </form>
      )}
    </div>
  );
}
