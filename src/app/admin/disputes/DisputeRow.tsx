"use client";

import { useState } from "react";
import Badge from "@/components/Badge";
import { formatCents } from "@/lib/money";
import { inputClass, secondaryButtonClass, primaryButtonClass, errorClass } from "@/lib/ui";

type DisputeData = {
  id: string;
  parentName: string;
  coachName: string;
  sessionDate: string;
  sessionPriceCents: number;
  reason: string;
  details: string;
  status: "OPEN" | "INFO_REQUESTED" | "REFUNDED" | "SIDED_WITH_COACH" | "DISMISSED";
  refundCents: number | null;
  adminNote: string | null;
};

const STATUS_VARIANT = {
  OPEN: "warning",
  INFO_REQUESTED: "warning",
  REFUNDED: "success",
  SIDED_WITH_COACH: "neutral",
  DISMISSED: "neutral",
} as const;

const REASON_LABEL: Record<string, string> = {
  NO_SHOW: "No-show",
  DISSATISFIED: "Not satisfied",
  OTHER: "Other issue",
};

export default function DisputeRow({ dispute }: { dispute: DisputeData }) {
  const [status, setStatus] = useState(dispute.status);
  const [refundCents, setRefundCents] = useState(dispute.sessionPriceCents);
  const [adminNote, setAdminNote] = useState(dispute.adminNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function act(action: string, extra?: Record<string, unknown>) {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/admin/disputes/${dispute.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote, ...extra }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    if (action === "refund") setStatus("REFUNDED");
    if (action === "side_with_coach") setStatus("SIDED_WITH_COACH");
    if (action === "request_info") setStatus("INFO_REQUESTED");
    if (action === "dismiss") setStatus("DISMISSED");
  }

  const resolved = status === "REFUNDED" || status === "SIDED_WITH_COACH" || status === "DISMISSED";

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-ink">{dispute.parentName} vs. {dispute.coachName}</p>
        <Badge variant={STATUS_VARIANT[status]}>{status.replaceAll("_", " ")}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Session {dispute.sessionDate} &middot; {formatCents(dispute.sessionPriceCents)} &middot;{" "}
        <span className="font-bold text-ink">{REASON_LABEL[dispute.reason] ?? dispute.reason}</span>
      </p>
      <p className="text-sm text-ink">{dispute.details}</p>
      {status === "REFUNDED" && dispute.refundCents !== null && (
        <p className="text-sm font-bold text-success">Refunded {formatCents(dispute.refundCents)}</p>
      )}

      {error && <p className={errorClass}>{error}</p>}

      {!resolved && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-ink bg-muted p-3">
          <textarea
            className={inputClass}
            rows={2}
            placeholder="Internal note (optional)"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              className={`${inputClass} w-28`}
              value={refundCents / 100}
              onChange={(e) => setRefundCents(Math.round(Number(e.target.value) * 100))}
            />
            <button onClick={() => act("refund", { refundCents })} disabled={loading} className={primaryButtonClass}>
              Issue refund
            </button>
            <button onClick={() => act("side_with_coach")} disabled={loading} className={secondaryButtonClass}>
              Side with coach
            </button>
            <button onClick={() => act("request_info")} disabled={loading} className={secondaryButtonClass}>
              Request more info
            </button>
            <button onClick={() => act("dismiss")} disabled={loading} className={secondaryButtonClass}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
