import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import Badge from "@/components/Badge";
import SportPill from "@/components/SportPill";
import { IconStar } from "@/components/icons";
import ParentTabs from "../ParentTabs";
import RatingForm from "../RatingForm";
import DisputeButton from "../DisputeButton";
import { MarkCompleteButton, NoShowButton, TipForm } from "../BookingActions";

const STATUS_VARIANT = {
  PENDING_CONSENT: "warning",
  CONFIRMED: "accent",
  COMPLETED: "success",
  CANCELLED: "neutral",
} as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING_CONSENT: "Pending",
  CONFIRMED: "Upcoming",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PAYMENT_LABEL: Record<string, string> = {
  AUTHORIZED: "Payment held",
  CAPTURED: "Payment charged",
  CANCELLED: "Never charged",
  REFUNDED: "Refunded",
};

export default async function MyBookingsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/bookings");
  if (session.user.role !== "PARENT") redirect("/dashboard");

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) redirect("/dashboard");

  const bookings = await prisma.booking.findMany({
    where: { parentProfileId: parentProfile.id },
    include: {
      coachProfile: { include: { user: true } },
      child: true,
      review: true,
      dispute: true,
    },
    orderBy: { scheduledAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl text-ink">My Bookings</h1>
      <p className="mb-6 text-muted-foreground">
        Every session you&apos;ve booked — upcoming and past — with full details and status.
      </p>

      <ParentTabs />

      {bookings.length === 0 ? (
        <p className="text-muted-foreground">Nothing booked yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map((b) => {
            const netPriceCents = b.priceCents - b.discountCents;
            return (
              <div key={b.id} className="card flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <SportPill sport={b.sport} />
                      <p className="font-bold text-ink">{b.coachProfile.user.name}</p>
                      <span className="text-sm text-muted-foreground">&middot; {b.child?.firstName ?? "Session"}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {b.scheduledAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}{" "}
                      &middot; {b.durationMinutes} min &middot; {b.locationText}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                    <span className="text-xs font-bold text-muted-foreground">{PAYMENT_LABEL[b.paymentStatus]}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-line pt-2">
                  <p className="text-sm font-bold text-pitch">
                    {formatCents(netPriceCents)}
                    {b.tippedAt && <span className="ml-1 text-xs font-bold text-accent">+ {formatCents(b.tipCents)} tip</span>}
                  </p>
                  {b.autoCompleted && (
                    <span className="text-xs text-muted-foreground">Auto-completed after 48h with no response</span>
                  )}
                </div>

                {b.videoCallUrl && b.status === "CONFIRMED" && (
                  <p className="text-xs text-muted-foreground">
                    First session — video call: <code className="text-pitch">{b.videoCallUrl}</code>
                  </p>
                )}

                {b.status === "CONFIRMED" && (
                  <div className="flex flex-wrap items-center gap-2 border-t-2 border-line pt-2">
                    <MarkCompleteButton bookingId={b.id} />
                    <NoShowButton bookingId={b.id} />
                  </div>
                )}

                {b.status === "COMPLETED" && (
                  <div className="flex flex-col gap-3 border-t-2 border-line pt-2">
                    {b.progressWhatWorkedOn && (
                      <p className="text-sm text-ink">
                        <span className="font-bold">Worked on: </span>
                        {b.progressWhatWorkedOn}
                      </p>
                    )}

                    {b.review ? (
                      <div className="flex items-center gap-2">
                        <span className="flex text-gold">
                          {Array.from({ length: b.review.rating }).map((_, i) => (
                            <IconStar key={i} className="h-4 w-4" />
                          ))}
                        </span>
                        {b.review.comment && <span className="text-sm text-muted-foreground">{b.review.comment}</span>}
                      </div>
                    ) : (
                      <RatingForm bookingId={b.id} coachName={b.coachProfile.user.name} />
                    )}

                    {b.tippedAt ? null : <TipForm bookingId={b.id} />}

                    {b.dispute ? (
                      <p className="text-sm font-bold text-warning">
                        Case open: {b.dispute.status.replaceAll("_", " ").toLowerCase()}
                      </p>
                    ) : (
                      <DisputeButton bookingId={b.id} />
                    )}
                  </div>
                )}

                {b.status === "CANCELLED" && (
                  <div className="border-t-2 border-line pt-2">
                    {b.dispute ? (
                      <p className="text-sm font-bold text-warning">
                        Case open: {b.dispute.status.replaceAll("_", " ").toLowerCase()} — {b.dispute.details}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">This session was cancelled.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
