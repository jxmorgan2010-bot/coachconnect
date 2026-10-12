import type { BackgroundCheckStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { getBackgroundCheckExpiryState, isSelfServeBackgroundCheck } from "@/lib/coach";

const STATUS_META: Record<BackgroundCheckStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  NOT_STARTED: { label: "Waiting for our team", variant: "neutral" },
  PENDING: { label: "In progress", variant: "warning" },
  CLEAR: { label: "Step complete", variant: "success" },
  FLAGGED: { label: "Needs a follow-up from our team", variant: "danger" },
};

/** Status only: an admin marks this step from the admin page. Coaches can't start or renew it themselves. */
export default function BackgroundCheckPanel({
  status,
  expiresAt,
  checkRef,
}: {
  status: BackgroundCheckStatus;
  expiresAt: Date | null;
  checkRef: string | null;
}) {
  // A CLEAR left by the old self-serve check doesn't count until an admin marks it.
  const shownStatus: BackgroundCheckStatus =
    status === "CLEAR" && isSelfServeBackgroundCheck({ backgroundCheckRef: checkRef }) ? "NOT_STARTED" : status;
  const meta = STATUS_META[shownStatus];
  const expiryState = getBackgroundCheckExpiryState({
    backgroundCheckStatus: status,
    backgroundCheckExpiresAt: expiresAt,
    backgroundCheckRef: checkRef,
  });
  const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex flex-col gap-3">
      {/* Process wording only — the check is a placeholder, so nothing here may read as a real
          verification outcome (see REDESIGN-FOLLOWUPS.md #2). */}
      <p className="text-sm text-ink/85">
        <span className="font-bold text-ink">Background check:</span> required before your profile goes live.
        During our early beta, our team reviews each coach personally and marks this step when it&apos;s done.
        It&apos;s reviewed again once a year.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {shownStatus === "CLEAR" && expiresAt && (
          <span className="text-sm text-muted-foreground">
            {expiryState === "EXPIRED" ? `Lapsed ${formatDate(expiresAt)}` : `Due again by ${formatDate(expiresAt)}`}
          </span>
        )}
      </div>
    </div>
  );
}
