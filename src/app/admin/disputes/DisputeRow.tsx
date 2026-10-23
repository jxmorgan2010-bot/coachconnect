"use client";

import { useState } from "react";
import Badge from "@/components/Badge";
import { formatCents } from "@/lib/money";
import { inputClass, labelClass, secondaryButtonClass, errorClass } from "@/lib/ui";
import type { DisputeStatus, PaymentStatus } from "@/generated/prisma/client";
import { RefundForm, WaiveForm } from "../refunds/RefundForms";

export type DisputeData = {
  id: string;
  parentName: string;
  coachName: string;
  sessionDate: string;
  /** What the parent paid for the session (price less credit or bundle discount). */
  chargedCents: number;
  refundedCents: number;
  paymentStatus: PaymentStatus;
  /** Captured and paid by card (the booking's own or its package's), with money left to refund. */
  refundable: boolean;
  lateCancellation: boolean;
  /** Set for a late cancellation that hasn't been waived: what waiving would do. */
  waiveOutcome: string | null;
  reason: string;
  details: string;
  status: DisputeStatus;
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
  PARTIALLY_REFUNDED: "Partially refunded",
} as const;

// Refunds only apply to captured card payments; say why for every other state instead of
// assuming a no-show voided it.
const NO_REFUND_NOTE: Record<PaymentStatus, string> = {
  AUTHORIZED: "No refund possible yet — the card is only held, so nothing has been charged.",
  CANCELLED: "No refund needed — the card hold was voided, so the parent was never charged.",
  REFUNDED: "This payment has already been refunded in full.",
  CAPTURED: "This session was covered by referral credit, not a card, so there's nothing to refund through Stripe.",
  PARTIALLY_REFUNDED: "",
};

const REASON_LABEL: Record<string, string> = {
  NO_SHOW: "No-show",
  DISSATISFIED: "Not satisfied",
  OTHER: "Other issue",
};

export default function DisputeRow({ dispute }: { dispute: DisputeData }) {
  // Refunds and waivers refresh the page, so the status comes from props unless an action here just set it.
  const [localStatus, setStatus] = useState<DisputeStatus | null>(null);
  const status = localStatus ?? dispute.status;
  const [adminNote, setAdminNote] = useState(dispute.adminNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function act(action: "side_with_coach" | "request_info" | "dismiss") {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/admin/disputes/${dispute.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    if (action === "side_with_coach") setStatus("SIDED_WITH_COACH");
    if (action === "request_info") setStatus("INFO_REQUESTED");
    if (action === "dismiss") setStatus("DISMISSED");
  }

  const resolved = status === "REFUNDED" || status === "SIDED_WITH_COACH" || status === "DISMISSED";
  const remainingCents = dispute.chargedCents - dispute.refundedCents;
  const endpoint = `/api/admin/disputes/${dispute.id}`;

  return (
    <div className={`${resolved ? "card-flat" : "card"} flex flex-col gap-3 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow mb-1 text-muted-foreground">
            {REASON_LABEL[dispute.reason] ?? dispute.reason}
            {dispute.lateCancellation && " · Late cancellation"}
          </p>
          <p className="font-bold text-ink">
            {dispute.parentName} <span className="font-normal text-muted-foreground">vs.</span> {dispute.coachName}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Session {dispute.sessionDate} · {formatCents(dispute.chargedCents)} · {PAYMENT_LABEL[dispute.paymentStatus]}
      </p>
      <p className="border-l-4 border-gold pl-3 text-sm text-ink">{dispute.details}</p>
      {dispute.refundedCents > 0 && (
        <p className="text-sm font-bold text-success">
          Refunded {formatCents(dispute.refundedCents)} of {formatCents(dispute.chargedCents)}
        </p>
      )}

      {error && <p role="alert" className={errorClass}>{error}</p>}

      {(!resolved || dispute.refundable || dispute.waiveOutcome) && (
        <div className="flex flex-col gap-4 rounded-lg border-2 border-line bg-chalk p-3 sm:p-4">
          {dispute.waiveOutcome && <WaiveForm endpoint={endpoint} extra={{ action: "waive" }} outcome={dispute.waiveOutcome} />}
          {dispute.refundable ? (
            <RefundForm endpoint={endpoint} extra={{ action: "refund" }} defaultCents={remainingCents} maxCents={remainingCents} />
          ) : (
            !resolved && <p className="text-xs font-bold text-muted-foreground">{NO_REFUND_NOTE[dispute.paymentStatus]}</p>
          )}
          {!resolved && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
