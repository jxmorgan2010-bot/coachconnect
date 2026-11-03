import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { loadFixableBooking } from "@/lib/cardUpdate";
import { bookingChargeCents } from "@/lib/cancellation";
import { holdFixDeadline } from "@/lib/holdTiming";
import { formatCents } from "@/lib/money";
import { formatPacificDateTime } from "@/lib/sessionTiming";
import { quietLinkClass } from "@/lib/ui";
import SportPill from "@/components/SportPill";
import UpdateCardForm from "./UpdateCardForm";

export const metadata: Metadata = { title: "Update your card", robots: { index: false, follow: false } };

/** Linked from the "update your card" email when a session's 2-day hold failed (src/lib/cardHolds.ts). */
export default async function UpdateCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session?.user) redirect(`/login?callbackUrl=/dashboard/bookings/${id}/card`);
  if (session.user.role !== "PARENT") redirect("/dashboard");

  const found = await loadFixableBooking(id, session.user.id);
  if (found.error === "NOT_FOUND") notFound();
  const b = found.booking;
  const amountCents = bookingChargeCents(b);

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 md:py-12">
      <p className="eyebrow mb-2 text-pitch">Your booking</p>
      <h1 className="text-display-lg font-display text-ink">Update your card</h1>

      <div className="card mt-6 flex flex-col gap-1.5 p-4 sm:p-5">
        <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
          <SportPill sport={b.sport} />
          {b.child?.firstName ?? "Session"} with {b.coachProfile.user.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatPacificDateTime(b.scheduledAt)} · {b.durationMinutes} min · {formatCents(amountCents)}
        </p>
      </div>

      <div className="mt-6">
        {found.error === "NOT_NEEDED" ? (
          <p className="rounded-lg border-2 border-line bg-surface p-4 text-sm text-ink">
            Nothing to update: this session&apos;s card is fine.
          </p>
        ) : found.error === "CLOSED" ? (
          <p className="rounded-lg border-2 border-line bg-surface p-4 text-sm text-ink">
            This session is no longer upcoming, so there&apos;s nothing to update here.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-ink">
              We couldn&apos;t place the {formatCents(amountCents)} hold on your saved card. Enter a card below and
              we&apos;ll place the hold now. A hold isn&apos;t a charge: you&apos;re charged after the session, same as
              before. <span className="font-bold">Do this by {formatPacificDateTime(holdFixDeadline(b.scheduledAt))}</span>,
              or the session will be cancelled.
            </p>
            <UpdateCardForm bookingId={b.id} amountCents={amountCents} />
          </div>
        )}
      </div>

      <Link href="/dashboard/bookings" className={`${quietLinkClass} mt-8 inline-flex text-pitch`}>
        All your bookings
      </Link>
    </div>
  );
}
