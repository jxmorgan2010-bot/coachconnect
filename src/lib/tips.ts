/**
 * A tip is charged to the card saved on the session's own booking. Package sessions, and sessions
 * paid entirely with referral credit, have no card on the booking, so they can't be tipped.
 */

type Tippable = { status: string; tippedAt: Date | null; stripePaymentMethodId: string | null };

/** Whether to offer a tip on this session (and whether the server would take one). */
export function canTip(b: Tippable, tipsEnabled: boolean): boolean {
  return tipsEnabled && b.status === "COMPLETED" && !b.tippedAt && !!b.stripePaymentMethodId;
}

/**
 * Whether a tip on record was charged. Earlier versions recorded a tip on a session with no card
 * without charging anything.
 */
export function tipWasCharged(b: { tippedAt: Date | null; stripePaymentMethodId: string | null }): boolean {
  return !!b.tippedAt && !!b.stripePaymentMethodId;
}
