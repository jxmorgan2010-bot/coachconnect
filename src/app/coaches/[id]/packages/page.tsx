import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { isCoachLive } from "@/lib/coach";
import SuspendedBlock from "@/components/SuspendedBlock";
import NoHoursNotice from "@/components/NoHoursNotice";
import PackagePurchaseForm from "./PackagePurchaseForm";

export default async function PackagePurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session?.user) redirect(`/login?callbackUrl=/coaches/${id}/packages`);
  if (session.user.role !== "PARENT") redirect("/dashboard");

  const profile = await prisma.coachProfile.findUnique({
    where: { id },
    include: { user: true, sports: true, availability: { select: { id: true }, take: 1 } },
  });
  if (!profile || !isCoachLive(profile) || !profile.hourlyRateCents) notFound();
  if (profile.availability.length === 0) {
    return <NoHoursNotice coachFirstName={profile.user.name.split(" ")[0]} coachProfileId={profile.id} />;
  }

  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { children: { orderBy: { createdAt: "asc" } }, user: { select: { isSuspended: true } } },
  });
  if (!parentProfile) redirect("/dashboard");
  if (parentProfile.user.isSuspended) return <SuspendedBlock action="buy a package" />;

  return (
    <PackagePurchaseForm
      coach={{
        id: profile.id,
        name: profile.user.name,
        hourlyRateCents: profile.hourlyRateCents,
        sports: profile.sports.map((s) => s.sport),
        isMinorCoach: profile.isMinorCoach,
      }}
    />
  );
}
