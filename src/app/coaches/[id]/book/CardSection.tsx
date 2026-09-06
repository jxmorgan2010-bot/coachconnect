"use client";

import { CardNumberElement, CardExpiryElement, CardCvcElement } from "@stripe/react-stripe-js";
import { inputClass, labelClass } from "@/lib/ui";

// Stripe Elements render in their own iframe, so the app's CSS variables/fonts
// aren't reachable — style them explicitly to match the rest of the inputs as closely as possible.
const elementStyle = {
  base: {
    fontSize: "14px",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    color: "#10201a",
    "::placeholder": { color: "#57614f" },
  },
  invalid: {
    color: "#c6362f",
  },
};

export default function CardSection({
  zip,
  onZipChange,
}: {
  zip: string;
  onZipChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className={labelClass}>Card details</p>
      <div>
        <label className={labelClass} htmlFor="cardNumber">Card number</label>
        <div id="cardNumber" className={inputClass}>
          <CardNumberElement options={{ style: elementStyle, placeholder: "4242 4242 4242 4242" }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass} htmlFor="cardExpiry">Expiry</label>
          <div id="cardExpiry" className={inputClass}>
            <CardExpiryElement options={{ style: elementStyle }} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="cardCvc">CVC</label>
          <div id="cardCvc" className={inputClass}>
            <CardCvcElement options={{ style: elementStyle }} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="cardZip">Zip</label>
          <input
            id="cardZip"
            className={inputClass}
            inputMode="numeric"
            maxLength={10}
            placeholder="78701"
            value={zip}
            onChange={(e) => onZipChange(e.target.value)}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Test mode — use card number 4242 4242 4242 4242, any future expiry, any CVC, and any zip.
      </p>
    </div>
  );
}
