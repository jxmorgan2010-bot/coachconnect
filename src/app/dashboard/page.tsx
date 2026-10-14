import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getCoachReviewStatus } from "@/lib/coachReview";
import CoachDashboard from "./CoachDashboard";
import ParentDashboard from "./ParentDashboard";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");
  if (session.user.role === "ADMIN") redirect("/admin");

  if (session.user.role === "COACH") {
    const status = await getCoachReviewStatus(session.user.id);
    // Coaches who have finished their own onboarding steps (and are waiting for an admin), or
    // who have been approved at least once, stay on their dashboard. It explains where they
    // stand (submitted, renewal, suspension) and links back to onboarding to make changes,
    // rather than bouncing them into the checklist on every sign-in.
    if (!status || (!status.idApproved && !status.ownStepsDone)) redirect("/onboarding/coach");
    return <CoachDashboard coachProfileId={status.coachProfileId} awaitingReview={status.awaitingReview} />;
  }

  return <ParentDashboard userId={session.user.id} name={session.user.name ?? "there"} />;
}
