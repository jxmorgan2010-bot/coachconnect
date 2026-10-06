"use client";

import { useState } from "react";
import Link from "next/link";
import type { IdVerificationStatus, BackgroundCheckStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { getBackgroundCheckExpiryState } from "@/lib/coach";
import { secondaryButtonClass, primaryButtonClass, inputClass } from "@/lib/ui";

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
  isMinorCoach: boolean;
  minorGuardianConsentedAt: string | null;
  minorGuardianName: string | null;
  minorBackgroundCheckNote: string | null;
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

export default function AdminCoachRow({ coach, minorCoachesEnabled }: { coach: CoachRowData; minorCoachesEnabled: boolean }) {
  const [idStatus, setIdStatus] = useState(coach.idVerificationStatus);
  const [bgcStatus, setBgcStatus] = useState(coach.backgroundCheckStatus);
  const [expiresAt, setExpiresAt] = useState(coach.backgroundCheckExpiresAt);
  const [isSuspended, setIsSuspended] = useState(coach.isSuspended);
  const [loading, setLoading] = useState(false);
  const [minorNote, setMinorNote] = useState(coach.minorBackgroundCheckNote ?? "");
  const [minorNoteSaved, setMinorNoteSaved] = useState(Boolean(coach.minorBackgroundCheckNote));

  async function saveMinorNote() {
    setLoading(true);
    const res = await fetch(`/api/admin/coaches/${coach.id}/minor-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: minorNote }),
    });
    setLoading(false);
    if (res.ok) setMinorNoteSaved(true);
  }

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
    <div className={`${isSuspended ? "card-flat border-danger" : "card"} grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]`}>
      <div className="min-w-0">
        <Link href={`/coaches/${coach.id}`} className="inline-flex min-h-11 items-center font-display text-2xl leading-tight text-ink underline-offset-4 hover:underline">
          {coach.name}
        </Link>
        <p className="truncate text-sm text-muted-foreground">{coach.email}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
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
          {minorCoachesEnabled && coach.isMinorCoach && <Badge variant="accent">Minor Coach</Badge>}
        </div>

        {minorCoachesEnabled && coach.isMinorCoach && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border-2 border-line bg-chalk p-3">
            <p className="text-xs text-muted-foreground">
              Guardian consent:{" "}
              {coach.minorGuardianConsentedAt ? (
                <span className="font-bold text-ink">
                  Signed by {coach.minorGuardianName} on{" "}
                  {new Date(coach.minorGuardianConsentedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              ) : (
                "Not yet signed"
              )}
            </p>
            <label className="text-xs font-bold text-muted-foreground" htmlFor={`minor-note-${coach.id}`}>
              Admin note — alternative verification used (standard background checks may not apply to minor
              coaches)
            </label>
            <textarea
              id={`minor-note-${coach.id}`}
              rows={2}
              className={inputClass}
              value={minorNote}
              onChange={(e) => {
                setMinorNote(e.target.value);
                setMinorNoteSaved(false);
              }}
            />
            <button onClick={saveMinorNote} disabled={loading} className={`${secondaryButtonClass} self-start`}>
              {minorNoteSaved ? "Saved" : loading ? "Saving..." : "Save note"}
            </button>
          </div>
        )}
      </div>

      {/* Actions grouped by what they act on */}
      <div className="flex flex-col gap-3 border-t-2 border-line pt-4 lg:min-w-[22rem] lg:border-l-2 lg:border-t-0 lg:pl-5 lg:pt-0">
        <div role="group" aria-label={`ID actions for ${coach.name}`} className="flex flex-wrap items-center gap-2">
          <span className="eyebrow w-24 shrink-0 text-muted-foreground">ID</span>
          {coach.hasIdPhoto ? (
            <a
              href={`/api/admin/coaches/${coach.id}/id-photo`}
              className={secondaryButtonClass}
              target="_blank"
              rel="noreferrer"
            >
              View ID
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">Not uploaded</span>
          )}
          {idStatus !== "APPROVED" && (
            <button onClick={() => setId("APPROVED")} disabled={loading || !coach.hasIdPhoto} className={primaryButtonClass}>
              Approve
            </button>
          )}
          {idStatus !== "REJECTED" && (
            <button onClick={() => setId("REJECTED")} disabled={loading} className={`${secondaryButtonClass} text-danger`}>
              Reject
            </button>
          )}
        </div>

        <div role="group" aria-label={`Background check actions for ${coach.name}`} className="flex flex-wrap items-center gap-2">
          <span className="eyebrow w-24 shrink-0 text-muted-foreground">Background</span>
          {bgcStatus !== "CLEAR" && (
            <button onClick={() => setBgc("CLEAR")} disabled={loading} className={secondaryButtonClass}>
              Mark clear
            </button>
          )}
          {(expiryState === "RENEWAL_NEEDED" || expiryState === "EXPIRED") && (
            <button onClick={() => setBgc("CLEAR")} disabled={loading} className={secondaryButtonClass}>
              Renew (+12mo)
            </button>
          )}
          {bgcStatus !== "FLAGGED" && (
            <button onClick={() => setBgc("FLAGGED")} disabled={loading} className={`${secondaryButtonClass} text-danger`}>
              Flag
            </button>
          )}
        </div>

        {isSuspended && (
          <div role="group" aria-label={`Account actions for ${coach.name}`} className="flex flex-wrap items-center gap-2">
            <span className="eyebrow w-24 shrink-0 text-muted-foreground">Account</span>
            <button onClick={unsuspend} disabled={loading} className={secondaryButtonClass}>
              Unsuspend
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
