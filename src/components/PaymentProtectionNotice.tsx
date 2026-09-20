import { IconShieldCheck } from "@/components/icons";

/**
 * Framed as a benefit, not fine print — the existing payment-hold/dispute system (see
 * Dispute model, /api/bookings/[id]/no-show, /api/admin/disputes) only ever applies to
 * sessions booked and paid for in-app, so this exists to make that worth knowing before
 * a parent is tempted to pay a coach directly instead.
 */
export default function PaymentProtectionNotice() {
  return (
    <div className="rounded-lg border-2 border-ink bg-accent/10 p-4">
      <p className="mb-2 flex items-center gap-2 font-display text-base text-ink">
        <IconShieldCheck className="h-4 w-4 text-pitch" /> Why book through CoachConnect
      </p>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        <li>• <span className="font-bold text-ink">No-show coverage</span> — if a coach doesn&apos;t show, your card is never charged.</li>
        <li>• <span className="font-bold text-ink">Dispute resolution</span> — not satisfied with a session? Our team steps in.</li>
        <li>• <span className="font-bold text-ink">Refund guarantee</span> — payment is held until you mark a session complete.</li>
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        None of this applies to payment arranged outside the app — it only covers sessions booked and paid for here.
      </p>
    </div>
  );
}
