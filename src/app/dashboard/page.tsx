import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import CoachDashboard from "./CoachDashboard";
import ParentDashboard from "./ParentDashboard";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");
  if (session.user.role === "ADMIN") redirect("/admin");

  if (session.user.role === "COACH") {
    const profile = await prisma.coachProfile.findUnique({ where: { userId: session.user.id } });
    // Once a coach has been approved at least once, keep them on their working
    // dashboard even if they later lapse — it explains why (renewal/suspension)
    // and links back to onboarding to fix it, rather than bouncing them into
    // the from-scratch verification checklist.
    if (!profile || profile.idVerificationStatus !== "APPROVED") redirect("/onboarding/coach");
    return <CoachDashboard coachProfileId={profile.id} />;
  }

  return <ParentDashboard userId={session.user.id} name={session.user.name ?? "there"} />;
}
