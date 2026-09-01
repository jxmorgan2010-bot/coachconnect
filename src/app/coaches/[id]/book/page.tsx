import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { isCoachLive } from "@/lib/coach";
import BookingForm from "./BookingForm";

export default async function BookCoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    include: { children: { orderBy: { createdAt: "asc" } } },
  });
  if (!parentProfile) redirect("/dashboard");

  return (
    <BookingForm
      coach={{
        id: coach.id,
        name: coach.user.name,
        hourlyRateCents: coach.hourlyRateCents,
        sports: coach.sports.map((s) => s.sport),
      }}
      childOptions={parentProfile.children.map((c) => ({ id: c.id, firstName: c.firstName, gradeOrAge: c.gradeOrAge }))}
      creditCents={parentProfile.creditCents}
    />
  );
}
