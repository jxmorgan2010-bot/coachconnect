import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AdminHeader from "@/components/AdminHeader";
import DisputeRow, { type DisputeData } from "./DisputeRow";
import { COACH_TIMEZONE } from "@/lib/availability";
import { bookingChargeCents } from "@/lib/cancellation";
import { isCardRefundable, waiveOutcomeText } from "@/lib/refunds";

export default async function AdminDisputesPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/disputes");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const disputes = await prisma.dispute.findMany({
    include: {
      booking: { include: { package: { select: { stripePaymentIntentId: true } }, refunds: true } },
      parentProfile: { include: { user: true } },
      coachProfile: { include: { user: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const rows: DisputeData[] = disputes.map((d) => {
    const b = d.booking;
    const refundedCents = b.refunds.reduce((sum, r) => sum + r.amountCents, 0);
    const waived = b.refunds.some((r) => r.kind === "LATE_CANCEL_WAIVER");
    return {
      id: d.id,
      parentName: d.parentProfile.user.name,
      coachName: d.coachProfile.user.name,
      sessionDate: b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: COACH_TIMEZONE }),
      chargedCents: bookingChargeCents(b),
      refundedCents,
      paymentStatus: b.paymentStatus,
      refundable: isCardRefundable(b, refundedCents),
      lateCancellation: b.lateCancellation,
      waiveOutcome: b.lateCancellation && !waived ? waiveOutcomeText(b, refundedCents) : null,
      reason: d.reason,
      details: d.details,
      status: d.status,
      adminNote: d.adminNote,
    };
  });
  const isResolved = (s: string) => s === "REFUNDED" || s === "SIDED_WITH_COACH" || s === "DISMISSED";
  const active = rows.filter((r) => !isResolved(r.status));
  const resolved = rows.filter((r) => isResolved(r.status));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Disputes">
        Parents can flag a charged session as a problem, including a late cancellation. Refund all or part of it,
        waive a late-cancel charge, side with the coach, or ask both sides for more info.
      </AdminHeader>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="active-disputes">
          <h2 id="active-disputes" className="mb-3 flex items-baseline gap-2 font-display text-3xl text-ink">
            Needs a decision <span className="font-sans text-sm font-bold text-muted-foreground">{active.length}</span>
          </h2>
          {active.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
              No open disputes.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {active.map((d) => (
                <li key={d.id}>
                  <DisputeRow dispute={d} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {resolved.length > 0 && (
          <section aria-labelledby="resolved-disputes">
            <h2 id="resolved-disputes" className="mb-3 flex items-baseline gap-2 font-display text-3xl text-ink">
              Resolved <span className="font-sans text-sm font-bold text-muted-foreground">{resolved.length}</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {resolved.map((d) => (
                <li key={d.id}>
                  <DisputeRow dispute={d} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
