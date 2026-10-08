import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isCoachLive, getBackgroundCheckExpiryState } from "@/lib/coach";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { ageInWholeYears, coachAgeBand, describeCalendarDate, storedDateToCalendarDate, todayInPacific } from "@/lib/age";
import { coachConsentStatus, REVOKED_CANCEL_REASON } from "@/lib/minorConsent";
import { formatCents } from "@/lib/money";
import AdminHeader from "@/components/AdminHeader";
import AdminCoachRow, { type CoachRowData } from "./AdminCoachRow";
import type { CoachProfile, MinorConsent } from "@/generated/prisma/client";

function toRow(
  p: CoachProfile & { user: { name: string; email: string }; minorConsents: MinorConsent[] },
  adminNames: Map<string, string>,
): CoachRowData {
  const today = todayInPacific();
  const birth = p.dateOfBirth ? storedDateToCalendarDate(p.dateOfBirth) : null;
  const band = birth ? coachAgeBand(birth, today) : null;

  let consent: CoachRowData["consent"] = null;
  if (p.isMinorCoach) {
    const { status, current } = coachConsentStatus(p.minorConsents);
    const signed = p.minorConsents
      .filter((c) => c.completedAt)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];
    consent = {
      status,
      guardianName: current?.guardianName ?? null,
      guardianEmail: current?.guardianEmail ?? null,
      requestedAt: current?.createdAt.toISOString() ?? null,
      expiresAt: current?.expiresAt.toISOString() ?? null,
      linksIssued: p.minorConsents.length,
      signature: signed
        ? {
            guardianName: signed.guardianName,
            guardianEmail: signed.guardianEmail,
            signerLegalName: signed.signerLegalName,
            signerRelationship: signed.signerRelationship,
            typedSignature: signed.typedSignature,
            confirmedAdult: signed.confirmedAdult,
            emergencyContactName: signed.emergencyContactName,
            emergencyContactPhone: signed.emergencyContactPhone,
            consentTextVersion: signed.consentTextVersion,
            acknowledgedKeys: signed.acknowledgedKeys ? (JSON.parse(signed.acknowledgedKeys) as string[]) : [],
            signedAt: signed.completedAt!.toISOString(),
            signerIp: signed.signerIp,
            signerUserAgent: signed.signerUserAgent,
            revokedAt: signed.revokedAt?.toISOString() ?? null,
            revokeIp: signed.revokeIp,
          }
        : null,
    };
  }

  return {
    id: p.id,
    name: p.user.name,
    email: p.user.email,
    hasIdPhoto: Boolean(p.idPhotoPath),
    idVerificationStatus: p.idVerificationStatus,
    backgroundCheckStatus: p.backgroundCheckStatus,
    backgroundCheckExpiresAt: p.backgroundCheckExpiresAt ? p.backgroundCheckExpiresAt.toISOString() : null,
    isSuspended: p.isSuspended,
    profileComplete: Boolean(p.bio && p.schoolName && p.hourlyRateCents),
    dateOfBirth: birth ? describeCalendarDate(birth) : null,
    ageLabel:
      birth && band
        ? band.band === "ADULT"
          ? `age ${ageInWholeYears(birth, today)}`
          : `age ${ageInWholeYears(birth, today)}, turns 18 on ${describeCalendarDate(band.adultOn)}`
        : null,
    ageIdentityVerificationMethod: p.ageIdentityVerificationMethod,
    ageIdentityVerifiedAt: p.ageIdentityVerifiedAt?.toISOString() ?? null,
    ageIdentityVerifiedBy: p.ageIdentityVerifiedById ? (adminNames.get(p.ageIdentityVerifiedById) ?? null) : null,
    isMinorCoach: p.isMinorCoach,
    minorBackgroundCheckNote: p.minorBackgroundCheckNote,
    consent,
  };
}

export default async function AdminPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const [profiles, admins, openHolds] = await Promise.all([
    prisma.coachProfile.findMany({
      include: { user: true, sports: true, minorConsents: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true } }),
    // Platform-cancelled bookings whose card hold couldn't be voided automatically.
    prisma.booking.findMany({
      where: { status: "CANCELLED", paymentStatus: "AUTHORIZED", cancelledAt: { not: null } },
      include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
      orderBy: { cancelledAt: "desc" },
    }),
  ]);
  const adminNames = new Map(admins.map((a) => [a.id, a.name]));

  const suspended = profiles.filter((p) => p.isSuspended);
  const expiringSoon = profiles.filter((p) => !p.isSuspended && getBackgroundCheckExpiryState(p) === "RENEWAL_NEEDED");
  const pending = profiles.filter(
    (p) => !p.isSuspended && !isCoachLive(p) && getBackgroundCheckExpiryState(p) !== "RENEWAL_NEEDED",
  );
  const live = profiles.filter((p) => !p.isSuspended && isCoachLive(p) && getBackgroundCheckExpiryState(p) !== "RENEWAL_NEEDED");

  const sections = [
    { id: "suspended", title: "Suspended — 3+ reports", rows: suspended, hideWhenEmpty: true, empty: "" },
    { id: "expiring", title: "Background check step due within 30 days", rows: expiringSoon, hideWhenEmpty: true, empty: "" },
    { id: "pending", title: "Pending review", rows: pending, hideWhenEmpty: false, empty: "Nothing waiting on you." },
    { id: "live", title: "Live coaches", rows: live, hideWhenEmpty: false, empty: "No live coaches yet." },
  ].filter((s) => !s.hideWhenEmpty || s.rows.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Verifications">
        A coach only becomes searchable once their ID is approved <span className="font-bold text-ink">and</span>{" "}
        their background check step is marked clear. That check is currently a mock, not a real screening.
        {ENABLE_MINOR_COACHES && " Coaches under 18 also need completed parent/guardian consent before their ID can be approved."}
      </AdminHeader>

      <div className="flex flex-col gap-10">
        {openHolds.length > 0 && (
          <section aria-labelledby="sec-holds">
            <h2 id="sec-holds" className="mb-3 flex items-baseline gap-2 font-display text-3xl text-ink">
              Card holds to release
              <span className="font-sans text-sm font-bold text-muted-foreground">{openHolds.length}</span>
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              These sessions were cancelled automatically, but voiding the card hold failed. Release each hold in
              Stripe. The parent has been told they won&apos;t be charged.
            </p>
            <ul className="flex flex-col gap-2">
              {openHolds.map((b) => (
                <li key={b.id} className="card-flat flex flex-col gap-1 p-4 text-sm">
                  <span className="font-bold text-ink">
                    {b.parentProfile.user.name} with {b.coachProfile.user.name} ·{" "}
                    {formatCents(b.priceCents - b.discountCents)} held
                  </span>
                  <span className="text-muted-foreground">
                    Booking {b.id} · PaymentIntent {b.stripePaymentIntentId ?? "none"} · {b.cancelReason ?? REVOKED_CANCEL_REASON}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`sec-${s.id}`}>
            <h2 id={`sec-${s.id}`} className="mb-3 flex items-baseline gap-2 font-display text-3xl text-ink">
              {s.title}
              <span className="font-sans text-sm font-bold text-muted-foreground">{s.rows.length}</span>
            </h2>
            {s.rows.length === 0 ? (
              <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">{s.empty}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {s.rows.map((p) => (
                  <li key={p.id}>
                    <AdminCoachRow coach={toRow(p, adminNames)} minorCoachesEnabled={ENABLE_MINOR_COACHES} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
