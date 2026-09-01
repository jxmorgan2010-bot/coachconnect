import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isCoachLive, getBackgroundCheckExpiryState } from "@/lib/coach";
import AdminNav from "./AdminNav";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-2xl font-extrabold text-secondary">Admin</h1>
      <p className="mb-6 text-muted-foreground">
        A coach profile only becomes searchable once ID verification is approved AND the background check is
        clear.
      </p>

      <AdminNav />

      {suspended.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-bold text-secondary">Suspended — 3+ reports ({suspended.length})</h2>
          <div className="mb-10 flex flex-col gap-3">
            {suspended.map((p) => (
              <AdminCoachRow key={p.id} coach={toRow(p)} />
            ))}
          </div>
        </>
      )}

      {expiringSoon.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-bold text-secondary">Background check expiring within 30 days ({expiringSoon.length})</h2>
          <div className="mb-10 flex flex-col gap-3">
            {expiringSoon.map((p) => (
              <AdminCoachRow key={p.id} coach={toRow(p)} />
            ))}
          </div>
        </>
      )}

      <h2 className="mb-3 text-lg font-bold text-secondary">Pending review ({pending.length})</h2>
      <div className="mb-10 flex flex-col gap-3">
        {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
        {pending.map((p) => (
          <AdminCoachRow key={p.id} coach={toRow(p)} />
        ))}
      </div>

      <h2 className="mb-3 text-lg font-bold text-secondary">Live coaches ({live.length})</h2>
      <div className="flex flex-col gap-3">
        {live.length === 0 && <p className="text-sm text-muted-foreground">No live coaches yet.</p>}
        {live.map((p) => (
          <AdminCoachRow key={p.id} coach={toRow(p)} />
        ))}
      </div>
    </div>
  );
}
