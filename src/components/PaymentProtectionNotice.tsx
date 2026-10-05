import { IconShieldCheck } from "@/components/icons";

/**
 * Framed as a benefit, not fine print — the existing payment-hold/dispute system (see
 * Dispute model, /api/bookings/[id]/no-show, /api/admin/disputes) only ever applies to
 * sessions booked and paid for in-app, so this exists to make that worth knowing before
 * a parent is tempted to pay a coach directly instead.
 *
 * Each line maps to real behavior: single sessions are a manual-capture card hold, a
 * no-show report voids the hold (or returns a package session), and an admin reviews
 * disputes and can refund. No blanket "guarantee" — packages are prepaid.
 */
const POINTS = [
  { title: "Charged after, not before", body: "For a single session, your card is held and only charged once the session's done." },
  { title: "Coach didn't show?", body: "Report it and the hold is cancelled — or the session goes back into your package." },
  { title: "Something went wrong?", body: "Open a dispute and an admin reviews it, and can issue a refund." },
];

export default function PaymentProtectionNotice() {
  return (
    <div className="rounded-lg border-2 border-ink bg-accent/10 p-4">
      <p className="mb-3 flex items-center gap-2 font-display text-lg leading-none text-ink">
        <IconShieldCheck className="h-4 w-4 shrink-0 text-pitch" /> Why pay through CoachConnect
      </p>
      <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground">
        {POINTS.map((p) => (
          <li key={p.title} className="leading-snug">
            <span className="font-bold text-ink">{p.title}</span> {p.body}
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted-foreground">
        Only covers sessions booked and paid for here — not payment arranged outside the app.
      </p>
    </div>
  );
}
