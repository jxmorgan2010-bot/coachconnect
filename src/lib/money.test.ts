import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePriceBreakdown, coachEarnings } from "./money";
import { perSessionBreakdown } from "./bundles";

test("coach earnings are the full price less the 15% fee, whatever the family paid", () => {
  const { sessionCostCents, platformFeeCents } = calculatePriceBreakdown(6000, 60);
  // A $5 credit is stored as discountCents and plays no part in the coach's numbers.
  const booking = { priceCents: sessionCostCents, platformFeeCents, discountCents: 500 };
  assert.deepEqual(coachEarnings(booking), { sessionPriceCents: 6000, platformFeeCents: 900, youEarnCents: 5100 });
});

test("coach earnings match the payout calculatePriceBreakdown quotes at booking", () => {
  for (const [rate, minutes] of [[4500, 60], [3500, 30], [5000, 90], [3800, 45]]) {
    const quote = calculatePriceBreakdown(rate, minutes);
    const earned = coachEarnings({ priceCents: quote.sessionCostCents, platformFeeCents: quote.platformFeeCents });
    assert.equal(earned.youEarnCents, quote.coachPayoutCents);
  }
});

test("a package session's discount doesn't lower the coach's earnings", () => {
  const { priceCents, platformFeeCents, discountCents } = perSessionBreakdown(4500, 10);
  assert.equal(discountCents, 450);
  assert.deepEqual(coachEarnings({ priceCents, platformFeeCents }), { sessionPriceCents: 4500, platformFeeCents: 675, youEarnCents: 3825 });
});
