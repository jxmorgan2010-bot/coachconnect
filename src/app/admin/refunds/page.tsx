import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AdminHeader from "@/components/AdminHeader";
import SportPill from "@/components/SportPill";
import { formatCents } from "@/lib/money";
import { formatPacificDateTime } from "@/lib/sessionTiming";
import { bookingChargeCents } from "@/lib/cancellation";
import { sessionsLeft } from "@/lib/bundles";
import { suggestedUnusedRefund, waiveOutcomeText } from "@/lib/refunds";
import { quietLinkClass } from "@/lib/ui";
import { RefundForm, WaiveForm } from "./RefundForms";

const KIND_LABEL = {
  REFUND: "Session refund",
  LATE_CANCEL_WAIVER: "Late-cancel waiver",
  PACKAGE_UNUSED: "Unused package sessions",
} as const;

function SectionTitle({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <h2 id={id} className="mb-3 font-display text-3xl text-ink">
      {title} <span className="ml-1 font-sans text-sm font-bold text-muted-foreground">{count}</span>
    </h2>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

export default async function AdminRefundsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/refunds");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const people = { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } } as const;

  // Cancelled, but Stripe didn't finish the job: a hold that wasn't released, or a late
  // charge that didn't go through (declined, or an expired hold with no usable saved card).
  const stuck = await prisma.booking.findMany({
    where: { status: "CANCELLED", paymentStatus: "AUTHORIZED", stripePaymentIntentId: { not: null }, packageId: null },
    include: { ...people, refunds: true },
    orderBy: { cancelledAt: "desc" },
  });

  const lateCancels = await prisma.booking.findMany({
    where: { status: "CANCELLED", lateCancellation: true, refunds: { none: { kind: "LATE_CANCEL_WAIVER" } } },
    include: { ...people, refunds: true },
    orderBy: { cancelledAt: "desc" },
  });

  const packages = (
    await prisma.sessionPackage.findMany({
      where: { status: "ACTIVE" },
      include: people,
      orderBy: { createdAt: "desc" },
    })
  ).filter((p) => sessionsLeft(p) > 0);
  const requests = await prisma.report.findMany({ where: { targetType: "SESSION_PACKAGE", status: "OPEN" } });
  const requested = new Map(requests.map((r) => [r.targetId, r]));
  const packageRows = await Promise.all(packages.map(async (p) => ({ p, ...(await suggestedUnusedRefund(p)), request: requested.get(p.id) ?? null })));
  packageRows.sort((a, b) => Number(!!b.request) - Number(!!a.request));

  const history = await prisma.refund.findMany({
    include: {
      refundedBy: true,
      booking: { include: people },
      package: { include: people },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Refunds">
        Once a session is charged, only an admin can give money back. Waive late-cancel charges, refund unused package
        sessions, and see every refund with who made it and why. Session refunds from a parent&apos;s case are on{" "}
        <Link href="/admin/disputes" className={`${quietLinkClass} text-pitch`}>Disputes</Link>.
      </AdminHeader>

      <div className="flex flex-col gap-10">
        {stuck.length > 0 && (
          <section aria-labelledby="stuck">
            <SectionTitle id="stuck" title="Needs follow-up in Stripe" count={stuck.length} />
            <ul className="flex flex-col gap-3">
              {stuck.map((b) => (
                <li key={b.id} className="card flex flex-col gap-2 p-4 sm:p-5">
                  <p className="font-bold text-ink">
                    {b.parentProfile.user.name} <span className="font-normal text-muted-foreground">with</span> {b.coachProfile.user.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Session {formatPacificDateTime(b.scheduledAt)} · {formatCents(bookingChargeCents(b))} · PaymentIntent{" "}
                    <code className="break-all">{b.stripePaymentIntentId}</code>
                  </p>
                  <p className="text-sm text-ink">
                    {b.lateCancellation
                      ? "Late cancellation, but the charge didn't go through. Charge the parent in Stripe, or waive it below."
                      : "Cancelled without a charge, but the card hold wasn't released. Cancel the PaymentIntent in Stripe."}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="late">
          <SectionTitle id="late" title="Late cancellations" count={lateCancels.length} />
          {lateCancels.length === 0 ? (
            <Empty>No late cancellations to review.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {lateCancels.map((b) => {
                const refunded = b.refunds.reduce((sum, r) => sum + r.amountCents, 0);
                return (
                  <li key={b.id} className="card flex flex-col gap-3 p-4 sm:p-5">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                        <SportPill sport={b.sport} /> {b.parentProfile.user.name}{" "}
                        <span className="font-normal text-muted-foreground">with</span> {b.coachProfile.user.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Session {formatPacificDateTime(b.scheduledAt)} · cancelled{" "}
                        {b.cancelledAt ? formatPacificDateTime(b.cancelledAt) : ""} ·{" "}
                        {b.packageId ? "package session, counted as used" : `${formatCents(bookingChargeCents(b))} charged`}
                      </p>
                    </div>
                    <WaiveForm endpoint={`/api/admin/bookings/${b.id}/waive`} outcome={waiveOutcomeText(b, refunded)} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="packages">
          <SectionTitle id="packages" title="Packages with unused sessions" count={packageRows.length} />
          {packageRows.length === 0 ? (
            <Empty>No package has unused sessions right now.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {packageRows.map(({ p, unused, maxCents, suggestedCents, request }) => (
                <li key={p.id} className={`${request ? "card" : "card-flat"} flex flex-col gap-3 p-4 sm:p-5`}>
                  <div>
                    {request && <p className="eyebrow mb-1 text-warning">Parent asked for a refund</p>}
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      <SportPill sport={p.sport} /> {p.parentProfile.user.name}{" "}
                      <span className="font-normal text-muted-foreground">with</span> {p.coachProfile.user.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {unused} of {p.totalSessions} sessions unused · {formatCents(p.totalChargedCents)} paid
                    </p>
                    {request?.details && <p className="mt-2 border-l-4 border-gold pl-3 text-sm text-ink">{request.details}</p>}
                  </div>
                  {maxCents > 0 ? (
                    <RefundForm
                      endpoint={`/api/admin/packages/${p.id}/refund-unused`}
                      defaultCents={suggestedCents}
                      maxCents={maxCents}
                      buttonLabel={`Refund ${unused} unused`}
                    />
                  ) : (
                    <p className="text-xs font-bold text-muted-foreground">This package has already been refunded in full.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="history">
          <SectionTitle id="history" title="Refund history" count={history.length} />
          {history.length === 0 ? (
            <Empty>No refunds yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((r) => {
                const subject = r.booking ?? r.package;
                return (
                  <li key={r.id} className="card-flat flex flex-col gap-1 p-4 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">
                        {KIND_LABEL[r.kind]}
                        {subject && (
                          <span className="font-normal text-muted-foreground">
                            {" "}· {subject.parentProfile.user.name} with {subject.coachProfile.user.name}
                          </span>
                        )}
                      </p>
                      <p className="text-ink">{r.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        By {r.refundedBy.name} · {formatPacificDateTime(r.createdAt)}
                        {r.stripeRefundId && <> · <code className="break-all">{r.stripeRefundId}</code></>}
                      </p>
                    </div>
                    <p className="shrink-0 font-bold text-pitch">
                      {r.amountCents > 0 ? formatCents(r.amountCents) : "No money"}
                      {r.sessionCount > 0 && (
                        <span className="font-normal text-muted-foreground">
                          {" "}· {r.sessionCount} session{r.sessionCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
