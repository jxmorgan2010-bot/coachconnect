import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCents, AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";
import { goldButtonClass } from "@/lib/ui";
import DateTile from "@/components/DateTile";
import Badge from "@/components/Badge";
import SportPill from "@/components/SportPill";
import { IconStar, IconArrowRight } from "@/components/icons";
import ParentTabs from "../ParentTabs";
import RatingForm from "../RatingForm";
import SatisfactionGuaranteeNotice from "@/components/SatisfactionGuaranteeNotice";
import { MarkCompleteButton, NoShowButton, TipForm, QuickRebookButton } from "../BookingActions";

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

  // Grouped for scanning; every booking still renders the same actions as before.
  const now = new Date();
  const upcoming = bookings
    .filter((b) => b.status === "CONFIRMED" && b.scheduledAt >= now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const awaiting = bookings.filter((b) => b.status === "CONFIRMED" && b.scheduledAt < now);
  const pending = bookings.filter((b) => b.status === "PENDING_CONSENT");
  const past = bookings.filter((b) => b.status === "COMPLETED");
  const cancelled = bookings.filter((b) => b.status === "CANCELLED");

  const groups = [
    { id: "awaiting", title: "Did these happen?", note: "Mark each session complete, or report a problem.", items: awaiting },
    { id: "upcoming", title: "Upcoming", note: null, items: upcoming },
    { id: "pending", title: "Pending", note: null, items: pending },
    { id: "past", title: "Past sessions", note: null, items: past },
    { id: "cancelled", title: "Cancelled", note: null, items: cancelled },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
      <p className="eyebrow mb-2 text-pitch">Parent dashboard</p>
      <h1 className="text-display-lg font-display text-ink">Your bookings</h1>
      <p className="mt-2 mb-6 text-muted-foreground">Every session you&apos;ve booked, with its status and payment.</p>

      <ParentTabs />

      {bookings.length === 0 ? (
        <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
          <h2 className="text-display-md font-display text-ink">Nothing booked yet</h2>
          <p className="text-muted-foreground">Sessions you book will show up here with their status and payment.</p>
          <Link href="/coaches" className={goldButtonClass}>
            See coaches near you <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`group-${group.id}`}>
              <h2 id={`group-${group.id}`} className="mb-1 flex items-baseline gap-2 font-display text-3xl text-ink">
                {group.title}
                <span className="font-sans text-sm font-bold text-muted-foreground">{group.items.length}</span>
              </h2>
              {group.note && <p className="mb-3 text-sm text-muted-foreground">{group.note}</p>}
              <ul className="mt-3 flex flex-col gap-4">
                {group.items.map((b) => {
                  const netPriceCents = b.priceCents - b.discountCents;
                  return (
                    <li key={b.id} className={`${b.status === "CANCELLED" ? "card-flat" : "card"} flex flex-col gap-3 p-4 sm:p-5`}>
                      <div className="flex gap-4">
                        <DateTile date={b.scheduledAt} muted={b.status === "CANCELLED"} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <SportPill sport={b.sport} />
                              <p className="font-bold text-ink">{b.coachProfile.user.name}</p>
                              <span className="text-sm text-muted-foreground">· {b.child?.firstName ?? "Session"}</span>
                            </div>
                            {b.status === "CONFIRMED" && b.scheduledAt < now ? (
                              <Badge variant="warning">Not marked complete</Badge>
                            ) : (
                              <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {b.scheduledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ·{" "}
                            {b.durationMinutes} min · {b.locationText}
                          </p>
                          <p className="mt-1.5 text-sm">
                            <span className="font-bold text-pitch">{formatCents(netPriceCents)}</span>
                            {b.tippedAt && <span className="ml-1 font-bold text-ink">+ {formatCents(b.tipCents)} tip</span>}
                            <span className="text-muted-foreground"> · {PAYMENT_LABEL[b.paymentStatus]}</span>
                            {b.autoCompleted && (
                              <span className="text-muted-foreground">
                                {" "}· Auto-completed after {AUTO_RELEASE_GRACE_HOURS}h with no response
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {b.videoCallUrl && b.status === "CONFIRMED" && (
                        <p className="text-xs text-muted-foreground">
                          First session — video call: <code className="break-all text-pitch">{b.videoCallUrl}</code>
                        </p>
                      )}

                      {b.status === "CONFIRMED" && (
                        <div className="flex flex-wrap items-start gap-3 border-t-2 border-line pt-3">
                          <MarkCompleteButton bookingId={b.id} />
                          <NoShowButton bookingId={b.id} />
                        </div>
                      )}

                      {b.status === "COMPLETED" && (
                        <div className="flex flex-col gap-3 border-t-2 border-line pt-3">
                          {b.progressWhatWorkedOn && (
                            <p className="border-l-4 border-gold pl-3 text-sm text-ink">
                              <span className="font-bold">Worked on: </span>
                              {b.progressWhatWorkedOn}
                            </p>
                          )}

                          {b.review ? (
                            <div className="flex items-center gap-2">
                              <span className="flex text-gold" aria-hidden>
                                {Array.from({ length: b.review.rating }).map((_, i) => (
                                  <IconStar key={i} className="h-4 w-4" />
                                ))}
                              </span>
                              <span className="sr-only">You rated this {b.review.rating} out of 5.</span>
                              {b.review.comment && <span className="text-sm text-muted-foreground">{b.review.comment}</span>}
                            </div>
                          ) : (
                            <RatingForm bookingId={b.id} coachName={b.coachProfile.user.name} />
                          )}

                          <div className="flex flex-wrap items-start gap-3">
                            {b.tippedAt ? null : <TipForm bookingId={b.id} />}
                            <QuickRebookButton
                              bookingId={b.id}
                              coachName={b.coachProfile.user.name}
                              secondAdultName={b.coachProfile.isMinorCoach ? b.secondAdultName : null}
                            />
                          </div>

                          {b.dispute ? (
                            <p className="text-sm font-bold text-warning">
                              Case open: {b.dispute.status.replaceAll("_", " ").toLowerCase()}
                            </p>
                          ) : (
                            <SatisfactionGuaranteeNotice bookingId={b.id} />
                          )}
                        </div>
                      )}

                      {b.status === "CANCELLED" && (
                        <div className="border-t-2 border-line pt-3">
                          {b.dispute ? (
                            <p className="text-sm font-bold text-warning">
                              Case open: {b.dispute.status.replaceAll("_", " ").toLowerCase()} — {b.dispute.details}
                            </p>
                          ) : b.cancelledAt ? (
                            // Platform-cancelled (cancelReason is admin-facing; parents get the plain version)
                            <p className="text-sm text-muted-foreground">
                              CoachConnect cancelled this session because the coach is no longer available.{" "}
                              {b.packageId ? "The session went back into your package." : "You won't be charged for it."}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">This session was cancelled.</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
