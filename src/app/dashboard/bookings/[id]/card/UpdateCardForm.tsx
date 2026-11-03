"use client";

import { useState } from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardNumberElement } from "@stripe/react-stripe-js";
import CardSection from "@/app/coaches/[id]/book/CardSection";
import { formatCents } from "@/lib/money";
import { errorClass, primaryButtonClass, quietLinkClass, successClass } from "@/lib/ui";

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

export default function UpdateCardForm(props: { bookingId: string; amountCents: number }) {
  return (
    <Elements stripe={stripePromise}>
      <UpdateCardFormInner {...props} />
    </Elements>
  );
}

/** Places the session's hold on a new card now, with any bank authentication, and saves the card. */
function UpdateCardFormInner({ bookingId, amountCents }: { bookingId: string; amountCents: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="status" className={successClass}>
          Your card is updated and the {formatCents(amountCents)} hold is placed. You&apos;re all set for the session.
        </p>
        <Link href="/dashboard/bookings" className={`${quietLinkClass} text-pitch`}>Back to your bookings</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (zip.trim().length < 5) {
      setError("Enter your card's billing zip code.");
      return;
    }
    const card = elements?.getElement(CardNumberElement);
    if (!stripe || !card) {
      setError("The card form isn't ready yet. Wait a moment and try again.");
      return;
    }
    setLoading(true);
    const intentRes = await fetch(`/api/bookings/${bookingId}/card/intent`, { method: "POST" });
    const intentData = await intentRes.json();
    if (!intentRes.ok) {
      setLoading(false);
      setError(intentData.error ?? "Something went wrong.");
      return;
    }
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(intentData.clientSecret, {
      payment_method: { card, billing_details: { address: { postal_code: zip.trim() } } },
    });
    if (stripeError || !paymentIntent) {
      setLoading(false);
      setError(stripeError?.message ?? "Your card couldn't be authorized.");
      return;
    }
    const res = await fetch(`/api/bookings/${bookingId}/card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setDone(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <CardSection zip={zip} onZipChange={setZip} />
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" className={`${primaryButtonClass} w-full sm:w-auto`} disabled={loading}>
        {loading ? "Placing the hold..." : `Hold ${formatCents(amountCents)} on this card`}
      </button>
    </form>
  );
}
