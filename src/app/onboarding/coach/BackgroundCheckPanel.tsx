"use client";

import { useState } from "react";
import type { BackgroundCheckStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { getBackgroundCheckExpiryState } from "@/lib/coach";
import { primaryButtonClass, errorClass } from "@/lib/ui";

const STATUS_META: Record<BackgroundCheckStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  NOT_STARTED: { label: "Not started", variant: "neutral" },
  PENDING: { label: "Pending...", variant: "warning" },
  CLEAR: { label: "Clear", variant: "success" },
  FLAGGED: { label: "Flagged — under admin review", variant: "danger" },
};

export default function BackgroundCheckPanel({
  initialStatus,
  expiresAt,
}: {
  initialStatus: BackgroundCheckStatus;
  expiresAt: Date | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [expiry, setExpiry] = useState(expiresAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setLoading(true);
    setStatus("PENDING");
    const res = await fetch("/api/coach/background-check", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setStatus(initialStatus);
      return;
    }
    setStatus(data.status);
    setExpiry(data.expiresAt ? new Date(data.expiresAt) : null);
  }

  const meta = STATUS_META[status];
  const expiryState = getBackgroundCheckExpiryState({ backgroundCheckStatus: status, backgroundCheckExpiresAt: expiry });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        We run a mock Checkr-style background check. Your profile can&apos;t go live until this comes back clear and
        an admin reviews it alongside your ID. Checks are valid for 12 months.
      </p>
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {status === "CLEAR" && expiry && (
          <span className="text-sm text-muted-foreground">
            {expiryState === "EXPIRED"
              ? `Expired ${expiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : `Valid through ${expiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
          </span>
        )}
        {(status === "NOT_STARTED" || status === "FLAGGED" || expiryState === "RENEWAL_NEEDED" || expiryState === "EXPIRED") && (
          <button onClick={start} className={primaryButtonClass} disabled={loading}>
            {loading
              ? "Submitting..."
              : status === "FLAGGED"
                ? "Run check again"
                : status === "CLEAR"
                  ? "Renew background check"
                  : "Start background check"}
          </button>
        )}
        {loading && status === "PENDING" && <span className="text-sm text-muted-foreground">Checking records...</span>}
      </div>
    </div>
  );
}
