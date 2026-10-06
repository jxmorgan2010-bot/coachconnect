"use client";

import { CardNumberElement, CardExpiryElement, CardCvcElement } from "@stripe/react-stripe-js";
import { inputClass, labelClass } from "@/lib/ui";

// Stripe Elements render in their own iframe, so the app's CSS variables/fonts
// aren't reachable — style them explicitly to match the rest of the inputs as closely as possible.
// 16px matches inputClass on phones and stops iOS from zooming into the field.
const elementStyle = {
  base: {
    fontSize: "16px",
    lineHeight: "24px",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    color: "#10201a",
    "::placeholder": { color: "#57614f" },
  },
  invalid: {
    color: "#c6362f",
  },
};

// Only hint at Stripe's test card when the app is actually running on test keys.
const isTestMode = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") ?? false;

// Focus lives inside Stripe's iframe, which :focus-within can't see — Stripe flags its
// container with .StripeElement--focus instead, so the wrapper keys its ring off that.
const stripeFieldClass = `${inputClass} has-[.StripeElement--focus]:outline-solid has-[.StripeElement--focus]:outline-3 has-[.StripeElement--focus]:outline-offset-2 has-[.StripeElement--focus]:outline-ink`;

export default function CardSection({
  zip,
  onZipChange,
}: {
  zip: string;
  onZipChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={labelClass}>Card details</legend>
      <div>
        <span className={labelClass}>Card number</span>
        <div className={stripeFieldClass}>
          <CardNumberElement options={{ style: elementStyle, placeholder: isTestMode ? "4242 4242 4242 4242" : undefined }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className={labelClass}>Expiry</span>
          <div className={stripeFieldClass}>
            <CardExpiryElement options={{ style: elementStyle }} />
          </div>
        </div>
        <div>
          <span className={labelClass}>CVC</span>
          <div className={stripeFieldClass}>
            <CardCvcElement options={{ style: elementStyle }} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="cardZip">Zip</label>
          <input
            id="cardZip"
            className={inputClass}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            placeholder="94110"
            value={zip}
            onChange={(e) => onZipChange(e.target.value)}
            required
          />
        </div>
      </div>
      {isTestMode && (
        <p className="rounded-md border-2 border-dashed border-line px-3 py-2 text-xs text-muted-foreground">
          Test mode — use card number 4242 4242 4242 4242, any future expiry, any CVC, and any zip.
        </p>
      )}
    </fieldset>
  );
}
