const BRAND_NAMES: Record<string, string> = {
  amex: "American Express",
  diners: "Diners Club",
  discover: "Discover",
  eftpos_au: "eftpos",
  jcb: "JCB",
  mastercard: "Mastercard",
  unionpay: "UnionPay",
  visa: "Visa",
};

/**
 * How a saved card is named to the parent, from Stripe's card brand and last 4 digits:
 * "Visa ending 4242"; "Card ending 4242" for a brand not listed; "Saved card" with no digits.
 */
export function cardLabel(brand: string | null | undefined, last4: string | null | undefined): string {
  const name = (brand && BRAND_NAMES[brand]) || "Card";
  if (last4) return `${name} ending ${last4}`;
  return name === "Card" ? "Saved card" : `Saved ${name} card`;
}
