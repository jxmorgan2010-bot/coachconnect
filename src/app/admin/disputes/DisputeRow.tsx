"use client";

import { useState } from "react";
import Badge from "@/components/Badge";
import { formatCents } from "@/lib/money";
import { inputClass, labelClass, secondaryButtonClass, primaryButtonClass, errorClass } from "@/lib/ui";

type DisputeData = {
  id: string;
  parentName: string;
  coachName: string;
  sessionDate: string;
  sessionPriceCents: number;
  paymentStatus: "AUTHORIZED" | "CAPTURED" | "CANCELLED" | "REFUNDED";
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

const STATUS_LABEL = {
  OPEN: "Open",
  INFO_REQUESTED: "Info requested",
  REFUNDED: "Refunded",
  SIDED_WITH_COACH: "Sided with coach",
  DISMISSED: "Dismissed",
} as const;

const PAYMENT_LABEL = {
  AUTHORIZED: "Card held, not charged",
  CAPTURED: "Charged",
  CANCELLED: "Hold voided",
  REFUNDED: "Refunded",
} as const;

// Refunds only apply to captured payments; say why for every other state instead of
// assuming a no-show voided it.
const NO_REFUND_NOTE = {
  AUTHORIZED: "No refund possible yet — the card is only held, so nothing has been charged.",
  CANCELLED: "No refund needed — the card hold was voided, so the parent was never charged.",
  REFUNDED: "This payment has already been refunded.",
  CAPTURED: "",
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
  const canRefund = dispute.paymentStatus === "CAPTURED";

  return (
    <div className={`${resolved ? "card-flat" : "card"} flex flex-col gap-3 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow mb-1 text-muted-foreground">{REASON_LABEL[dispute.reason] ?? dispute.reason}</p>
          <p className="font-bold text-ink">
            {dispute.parentName} <span className="font-normal text-muted-foreground">vs.</span> {dispute.coachName}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Session {dispute.sessionDate} · {formatCents(dispute.sessionPriceCents)} · {PAYMENT_LABEL[dispute.paymentStatus]}
      </p>
      <p className="border-l-4 border-gold pl-3 text-sm text-ink">{dispute.details}</p>
      {status === "REFUNDED" && dispute.refundCents !== null && (
        <p className="text-sm font-bold text-success">Refunded {formatCents(dispute.refundCents)}</p>
      )}

      {error && <p role="alert" className={errorClass}>{error}</p>}

      {!resolved && (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-line bg-chalk p-3 sm:p-4">
          {!canRefund && (
            <p className="text-xs font-bold text-muted-foreground">{NO_REFUND_NOTE[dispute.paymentStatus]}</p>
          )}
          <div>
            <label className={labelClass} htmlFor={`note-${dispute.id}`}>
              Internal note <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id={`note-${dispute.id}`}
              className={inputClass}
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
          </div>
          {canRefund && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className={labelClass} htmlFor={`refund-${dispute.id}`}>Refund amount ($)</label>
                <input
                  id={`refund-${dispute.id}`}
                  type="number"
                  inputMode="decimal"
                  className={`${inputClass} w-32`}
                  value={refundCents / 100}
                  onChange={(e) => setRefundCents(Math.round(Number(e.target.value) * 100))}
                />
              </div>
              <button onClick={() => act("refund", { refundCents })} disabled={loading} className={primaryButtonClass}>
                Issue refund
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
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
