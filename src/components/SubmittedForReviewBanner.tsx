import Badge from "@/components/Badge";

/** Shown to a coach who has finished onboarding and is waiting for an admin (home page and coach dashboard). */
export default function SubmittedForReviewBanner() {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-warning/10 p-4 sm:flex-row sm:items-center sm:gap-3"
    >
      <Badge variant="warning">Submitted</Badge>
      <span className="text-sm text-ink">
        Your profile is submitted. An admin will review it before families can find you.
      </span>
    </div>
  );
}
