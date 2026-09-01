import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import CoachOnboardingClient from "./CoachOnboardingClient";

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
    },
  });

  if (!profile) redirect("/dashboard");

  return <CoachOnboardingClient profile={profile} />;
}
