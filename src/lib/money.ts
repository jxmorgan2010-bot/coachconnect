export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export const PLATFORM_FEE_RATE = 0.15;

/**
 * Parent pays the session cost in full (no markup). The platform fee is
 * withheld from the coach's payout when funds are released after the
 * session is marked complete. Shown separately at checkout for transparency.
 */
export function calculatePriceBreakdown(hourlyRateCents: number, durationMinutes: number) {
  const sessionCostCents = Math.round((hourlyRateCents * durationMinutes) / 60);
  const platformFeeCents = Math.round(sessionCostCents * PLATFORM_FEE_RATE);
  const coachPayoutCents = sessionCostCents - platformFeeCents;
  return {
    sessionCostCents,
    platformFeeCents,
    totalChargedCents: sessionCostCents,
    coachPayoutCents,
  };
}
