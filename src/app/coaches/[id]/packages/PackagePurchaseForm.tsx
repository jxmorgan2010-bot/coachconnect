"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardNumberElement } from "@stripe/react-stripe-js";
import type { Sport } from "@/generated/prisma/client";
import { SPORT_LABELS } from "@/lib/sports";
import { calculateBundlePricing } from "@/lib/bundles";
import { formatCents } from "@/lib/money";
import { inputClass, labelClass, primaryButtonClass, errorClass, successClass } from "@/lib/ui";
import CardSection from "../book/CardSection";

const DURATIONS = [30, 60, 90, 120];

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

type CoachInfo = { id: string; name: string; hourlyRateCents: number; sports: Sport[]; isMinorCoach: boolean };

export default function PackagePurchaseForm(props: { coach: CoachInfo }) {
  return (
    <Elements stripe={stripePromise}>
      <PackagePurchaseFormInner {...props} />
    </Elements>
  );
}

function PackagePurchaseFormInner({ coach }: { coach: CoachInfo }) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [sport, setSport] = useState<Sport>(coach.sports[0]);
  const [duration, setDuration] = useState(60);
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const pricing = useMemo(() => calculateBundlePricing(coach.hourlyRateCents, duration), [coach.hourlyRateCents, duration]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError("The payment form isn't ready yet — please wait a moment and try again.");
      return;
    }
    const cardNumberElement = elements.getElement(CardNumberElement);
    if (!cardNumberElement) {
      setError("Enter your card details.");
      return;
    }
    if (zip.trim().length < 5) {
      setError("Enter your card's billing zip code.");
      return;
    }

    setLoading(true);

    const intentRes = await fetch("/api/packages/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachProfileId: coach.id, sport, durationMinutes: duration }),
    });
    const intentData = await intentRes.json();
    if (!intentRes.ok) {
      setLoading(false);
      setError(intentData.error ?? "Something went wrong.");
      return;
    }

    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(intentData.clientSecret, {
      payment_method: { card: cardNumberElement, billing_details: { address: { postal_code: zip.trim() } } },
    });
    if (stripeError) {
      setLoading(false);
      setError(stripeError.message ?? "Your card couldn't be charged.");
      return;
    }

    const confirmRes = await fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId: paymentIntent?.id }),
    });
    const confirmData = await confirmRes.json();
    setLoading(false);
    if (!confirmRes.ok) {
      setError(confirmData.error ?? "Something went wrong.");
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="card p-6 sm:p-8">
          <p className="eyebrow mb-3 text-pitch">Package purchased</p>
          <h1 className="text-display-md font-display text-ink">
            {pricing.sessionCount} sessions with {coach.name}, paid in full
          </h1>
          <p className={`${successClass} mt-4`}>
            Book any of your {pricing.sessionCount} sessions on the calendar whenever you&apos;re ready — no further
            charge.
          </p>
          <button onClick={() => router.push("/dashboard")} className={`${primaryButtonClass} mt-6 w-full sm:w-auto`}>
            Go to my dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="eyebrow mb-2 text-pitch">Session package</p>
      <h1 className="text-display-lg font-display text-ink">
        {pricing.sessionCount} sessions with {coach.name}
      </h1>
      <p className="mt-2 max-w-lg text-muted-foreground">
        Pay for {pricing.sessionCount} sessions upfront and save {pricing.discountPercent}%. You still schedule each one
        on the calendar whenever you&apos;re ready.
      </p>
      {coach.isMinorCoach && (
        <p className="mt-4 max-w-lg rounded-lg border-2 border-ink bg-accent/10 px-3.5 py-2.5 text-sm text-ink">
          <span className="font-bold">{coach.name.split(" ")[0]} is under 18.</span> Every session in this package needs
          you plus a second adult there. You&apos;ll name the second adult each time you schedule a session.
        </p>
      )}

      <form onSubmit={onSubmit} className="card mt-6 flex flex-col gap-5 p-5 sm:p-6">
        {error && <p role="alert" className={errorClass}>{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="sport">Sport</label>
            <select id="sport" className={inputClass} value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              {coach.sports.map((s) => (
                <option key={s} value={s}>{SPORT_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="duration">Session length</label>
            <select id="duration" className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
            </select>
          </div>
        </div>

        {/* Same receipt treatment as the single-session booking form */}
        <div className="rounded-lg border-2 border-ink bg-chalk p-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{pricing.sessionCount} sessions at {formatCents(pricing.pricePerSessionCents)} each</span>
            <span className="font-bold text-ink">{formatCents(pricing.fullPriceCents)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-4 text-pitch">
            <span>Package discount ({pricing.discountPercent}% off)</span>
            <span className="font-bold">-{formatCents(pricing.savingsCents)}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-4 border-t-2 border-dashed border-ink pt-3 text-ink">
            <span className="font-display text-lg leading-none">Charged today</span>
            <span className="font-display text-2xl leading-none">{formatCents(pricing.totalChargedCents)}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Unlike a single session, this charges your card in full today — not a hold. Sessions you book against it
            need no further charge.
          </p>
        </div>

        {stripe && elements ? (
          <CardSection zip={zip} onZipChange={setZip} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading payment form...</p>
        )}

        <button type="submit" className={`${primaryButtonClass} w-full text-base`} disabled={loading}>
          {loading ? "Purchasing..." : `Buy package — ${formatCents(pricing.totalChargedCents)}`}
        </button>
      </form>
    </div>
  );
}
