"use client";

import { useState } from "react";
import Link from "next/link";
import type { IdVerificationStatus, BackgroundCheckStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { getBackgroundCheckExpiryState } from "@/lib/coach";
import { secondaryButtonClass } from "@/lib/ui";

type CoachRowData = {
  id: string;
  name: string;
  email: string;
  hasIdPhoto: boolean;
  idVerificationStatus: IdVerificationStatus;
  backgroundCheckStatus: BackgroundCheckStatus;
  backgroundCheckExpiresAt: string | null;
  isSuspended: boolean;
  profileComplete: boolean;
};

const ID_BADGE: Record<IdVerificationStatus, "success" | "warning" | "danger"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};

const BGC_BADGE: Record<BackgroundCheckStatus, "success" | "warning" | "danger" | "neutral"> = {
  CLEAR: "success",
  PENDING: "warning",
  FLAGGED: "danger",
  NOT_STARTED: "neutral",
};

export default function AdminCoachRow({ coach }: { coach: CoachRowData }) {
  const [idStatus, setIdStatus] = useState(coach.idVerificationStatus);
  const [bgcStatus, setBgcStatus] = useState(coach.backgroundCheckStatus);
  const [expiresAt, setExpiresAt] = useState(coach.backgroundCheckExpiresAt);
  const [isSuspended, setIsSuspended] = useState(coach.isSuspended);
  const [loading, setLoading] = useState(false);

  async function setId(status: "APPROVED" | "REJECTED") {
    setLoading(true);
    const res = await fetch(`/api/admin/coaches/${coach.id}/id-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (res.ok) setIdStatus(status);
  }

  async function setBgc(status: "CLEAR" | "FLAGGED") {
    setLoading(true);
    const res = await fetch(`/api/admin/coaches/${coach.id}/background-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (res.ok) {
      setBgcStatus(status);
      setExpiresAt(status === "CLEAR" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null);
    }
  }

  async function unsuspend() {
    setLoading(true);
    const res = await fetch(`/api/admin/coaches/${coach.id}/unsuspend`, { method: "POST" });
    setLoading(false);
    if (res.ok) setIsSuspended(false);
  }

  const expiryState = getBackgroundCheckExpiryState({
    backgroundCheckStatus: bgcStatus,
    backgroundCheckExpiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Link href={`/coaches/${coach.id}`} className="font-bold text-secondary hover:text-primary">
          {coach.name}
        </Link>
        <p className="text-xs text-muted-foreground">{coach.email}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant={coach.profileComplete ? "success" : "neutral"}>
            {coach.profileComplete ? "Profile complete" : "Profile incomplete"}
          </Badge>
          <Badge variant={ID_BADGE[idStatus]}>ID: {idStatus.toLowerCase()}</Badge>
          <Badge variant={BGC_BADGE[bgcStatus]}>Background: {bgcStatus.toLowerCase().replace("_", " ")}</Badge>
          {expiryState === "RENEWAL_NEEDED" && (
            <Badge variant="warning">
              Expires {expiresAt ? new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
            </Badge>
          )}
          {expiryState === "EXPIRED" && <Badge variant="danger">Background check expired</Badge>}
          {isSuspended && <Badge variant="danger">Suspended — 3+ reports</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {coach.hasIdPhoto && (
          <a
            href={`/api/admin/coaches/${coach.id}/id-photo`}
            className={secondaryButtonClass}
            target="_blank"
            rel="noreferrer"
          >
            View ID
          </a>
        )}
        {idStatus !== "APPROVED" && (
          <button onClick={() => setId("APPROVED")} disabled={loading || !coach.hasIdPhoto} className={secondaryButtonClass}>
            Approve ID
          </button>
        )}
        {idStatus !== "REJECTED" && (
          <button onClick={() => setId("REJECTED")} disabled={loading} className={`${secondaryButtonClass} text-danger`}>
            Reject ID
          </button>
        )}
        {bgcStatus !== "CLEAR" && (
          <button onClick={() => setBgc("CLEAR")} disabled={loading} className={secondaryButtonClass}>
            Mark BG Clear
          </button>
        )}
        {(expiryState === "RENEWAL_NEEDED" || expiryState === "EXPIRED") && (
          <button onClick={() => setBgc("CLEAR")} disabled={loading} className={secondaryButtonClass}>
            Renew (+12mo)
          </button>
        )}
        {bgcStatus !== "FLAGGED" && (
          <button onClick={() => setBgc("FLAGGED")} disabled={loading} className={`${secondaryButtonClass} text-danger`}>
            Flag BG
          </button>
        )}
        {isSuspended && (
          <button onClick={unsuspend} disabled={loading} className={secondaryButtonClass}>
            Unsuspend
          </button>
        )}
      </div>
    </div>
  );
}
