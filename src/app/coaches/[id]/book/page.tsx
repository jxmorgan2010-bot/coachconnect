import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { isCoachLive } from "@/lib/coach";
import SuspendedBlock from "@/components/SuspendedBlock";
import BookingForm from "./BookingForm";

export default async function BookCoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ packageId?: string }>;
}) {
  const { id } = await params;
  const { packageId } = await searchParams;
  const session = await getCurrentSession();
  if (!session?.user) redirect(`/login?callbackUrl=/coaches/${id}/book`);
  if (session.user.role !== "PARENT") redirect(`/coaches/${id}`);

  const coach = await prisma.coachProfile.findUnique({
    where: { id },
    include: { user: true, sports: true },
  });
  if (!coach || !isCoachLive(coach) || !coach.hourlyRateCents) notFound();

  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { children: { orderBy: { createdAt: "asc" } }, user: { select: { isSuspended: true } } },
  });
  if (!parentProfile) redirect("/dashboard");
  if (parentProfile.user.isSuspended) return <SuspendedBlock action="book sessions" />;

  let activePackage = null;
  if (packageId) {
    const pkg = await prisma.sessionPackage.findUnique({ where: { id: packageId } });
    if (pkg && pkg.parentProfileId === parentProfile.id && pkg.coachProfileId === coach.id && pkg.status === "ACTIVE") {
      activePackage = {
        id: pkg.id,
        sport: pkg.sport,
        durationMinutes: pkg.durationMinutes,
        sessionsRemaining: pkg.totalSessions - pkg.sessionsUsed,
      };
    }
  }

  return (
    <BookingForm
      coach={{
        id: coach.id,
        name: coach.user.name,
        hourlyRateCents: coach.hourlyRateCents,
        sports: coach.sports.map((s) => s.sport),
        isMinorCoach: coach.isMinorCoach,
      }}
      childOptions={parentProfile.children.map((c) => ({ id: c.id, firstName: c.firstName, gradeOrAge: c.gradeOrAge }))}
      creditCents={parentProfile.creditCents}
      activePackage={activePackage}
    />
  );
}
