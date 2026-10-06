import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isCoachLive, getBackgroundCheckExpiryState } from "@/lib/coach";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import AdminHeader from "@/components/AdminHeader";
import AdminCoachRow from "./AdminCoachRow";
import type { CoachProfile } from "@/generated/prisma/client";

function toRow(p: CoachProfile & { user: { name: string; email: string } }) {
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
    isMinorCoach: p.isMinorCoach,
    minorGuardianConsentedAt: p.minorGuardianConsentedAt ? p.minorGuardianConsentedAt.toISOString() : null,
    minorGuardianName: p.minorGuardianName,
    minorBackgroundCheckNote: p.minorBackgroundCheckNote,
  };
}

export default async function AdminPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const profiles = await prisma.coachProfile.findMany({
    include: { user: true, sports: true },
    orderBy: { createdAt: "desc" },
  });

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
      </AdminHeader>

      <div className="flex flex-col gap-10">
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
                    <AdminCoachRow coach={toRow(p)} minorCoachesEnabled={ENABLE_MINOR_COACHES} />
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
