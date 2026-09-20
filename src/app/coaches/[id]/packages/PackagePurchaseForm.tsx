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

type CoachInfo = { id: string; name: string; hourlyRateCents: number; sports: Sport[] };

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
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="card p-6">
          <p className={successClass}>Package purchased! You can now book any of your 5 sessions with {coach.name} on the calendar, no further charge.</p>
          <button onClick={() => router.push("/dashboard")} className={`${primaryButtonClass} mt-4`}>
            Go to my dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="mb-1 font-display text-3xl text-ink">Buy a session package with {coach.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Pay for 5 sessions upfront at a discount. Each one still gets scheduled individually on the calendar whenever
        you&apos;re ready.
      </p>

      <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-5">
        {error && <p className={errorClass}>{error}</p>}

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

        <div className="rounded-lg border-2 border-ink bg-muted p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{pricing.sessionCount} sessions at {formatCents(pricing.pricePerSessionCents)} each</span>
            <span className="font-bold text-ink">{formatCents(pricing.fullPriceCents)}</span>
          </div>
          <div className="flex justify-between text-pitch">
            <span>Package discount ({pricing.discountPercent}% off)</span>
            <span className="font-bold">-{formatCents(pricing.savingsCents)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-ink pt-2 font-display text-lg text-ink">
            <span>Charged today</span>
            <span>{formatCents(pricing.totalChargedCents)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Unlike a single session, this charges your card in full today — not a hold. Sessions you book against it
            need no further charge.
          </p>
        </div>

        {stripe && elements ? (
          <CardSection zip={zip} onZipChange={setZip} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading payment form...</p>
        )}

        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Purchasing..." : `Buy package — ${formatCents(pricing.totalChargedCents)}`}
        </button>
      </form>
    </div>
  );
}
