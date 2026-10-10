import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { coachConsentStatus } from "@/lib/minorConsent";
import CoachOnboardingClient from "./CoachOnboardingClient";
import type { MinorConsentSummary } from "./MinorGuardianConsentForm";

export default async function CoachOnboardingPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/onboarding/coach");
  if (session.user.role !== "COACH") redirect("/dashboard");

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      sports: true,
      availability: true,
      recommendations: { orderBy: { createdAt: "desc" } },
      user: { select: { isSuspended: true, email: true } },
    },
  });

  if (!profile) redirect("/dashboard");

  // Only a summary goes to the browser — never token hashes or the parent's emergency contact.
  let minorConsent: MinorConsentSummary | null = null;
  if (ENABLE_MINOR_COACHES && profile.isMinorCoach) {
    const rows = await prisma.minorConsent.findMany({ where: { coachProfileId: profile.id } });
    const { status, current } = coachConsentStatus(rows);
    minorConsent = {
      status,
      guardianName: current?.guardianName ?? null,
      guardianEmail: current?.guardianEmail ?? null,
      requestedAt: current?.createdAt.toISOString() ?? null,
      expiresAt: current?.expiresAt.toISOString() ?? null,
      signedByName: current?.signerLegalName ?? null,
      signedRelationship: current?.signerRelationship ?? null,
      signedAt: current?.completedAt?.toISOString() ?? null,
      revokedAt: current?.revokedAt?.toISOString() ?? null,
    };
  }

  return (
    <CoachOnboardingClient
      profile={profile}
      minorCoachesEnabled={ENABLE_MINOR_COACHES}
      minorConsent={minorConsent}
      coachEmail={profile.user.email}
    />
  );
}
