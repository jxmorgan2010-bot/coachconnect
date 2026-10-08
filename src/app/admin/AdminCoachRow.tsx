"use client";

import { useState } from "react";
import Link from "next/link";
import type { IdVerificationStatus, BackgroundCheckStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { getBackgroundCheckExpiryState } from "@/lib/coach";
import { secondaryButtonClass, primaryButtonClass, inputClass, errorClass } from "@/lib/ui";

export type ConsentStatus = "NONE" | "PENDING" | "EXPIRED" | "COMPLETED" | "REVOKED";

export type ConsentSignatureRecord = {
  guardianName: string;
  guardianEmail: string;
  signerLegalName: string | null;
  signerRelationship: string | null;
  typedSignature: string | null;
  confirmedAdult: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  consentTextVersion: string | null;
  acknowledgedKeys: string[];
  signedAt: string;
  signerIp: string | null;
  signerUserAgent: string | null;
  revokedAt: string | null;
  revokeIp: string | null;
};

export type CoachRowData = {
  id: string;
  name: string;
  email: string;
  hasIdPhoto: boolean;
  idVerificationStatus: IdVerificationStatus;
  backgroundCheckStatus: BackgroundCheckStatus;
  backgroundCheckExpiresAt: string | null;
  isSuspended: boolean;
  profileComplete: boolean;
  dateOfBirth: string | null;
  ageLabel: string | null;
  ageIdentityVerificationMethod: string | null;
  ageIdentityVerifiedAt: string | null;
  ageIdentityVerifiedBy: string | null;
  isMinorCoach: boolean;
  minorBackgroundCheckNote: string | null;
  consent: {
    status: ConsentStatus;
    guardianName: string | null;
    guardianEmail: string | null;
    requestedAt: string | null;
    expiresAt: string | null;
    linksIssued: number;
    /** The most recent signed consent, revoked or not. */
    signature: ConsentSignatureRecord | null;
  } | null;
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

const CONSENT_BADGE: Record<ConsentStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  NONE: { label: "Consent: not requested", variant: "neutral" },
  PENDING: { label: "Consent: pending", variant: "warning" },
  EXPIRED: { label: "Consent: expired", variant: "danger" },
  COMPLETED: { label: "Consent: completed", variant: "success" },
  REVOKED: { label: "Consent: revoked", variant: "danger" },
};

function stamp(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " PT"
    : "—";
}

function IssuedLink({ link, sendTo, expiresAt }: { link: string; sendTo: string; expiresAt: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-surface p-3">
      <p className="text-xs text-muted-foreground">
        Shown once. Send it to <span className="font-bold text-ink">{sendTo}</span>
        {expiresAt ? `; it expires ${stamp(expiresAt)}.` : "; it doesn't expire."} Any earlier link of this kind no
        longer works.
      </p>
      <code className="block break-all rounded bg-chalk px-2 py-1.5 text-xs text-pitch">{link}</code>
      <button
        type="button"
        className={`${secondaryButtonClass} self-start`}
        onClick={() => {
          navigator.clipboard?.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy link to send manually"}
      </button>
    </div>
  );
}

export default function AdminCoachRow({ coach, minorCoachesEnabled }: { coach: CoachRowData; minorCoachesEnabled: boolean }) {
  const [idStatus, setIdStatus] = useState(coach.idVerificationStatus);
  const [bgcStatus, setBgcStatus] = useState(coach.backgroundCheckStatus);
  const [expiresAt, setExpiresAt] = useState(coach.backgroundCheckExpiresAt);
  const [isSuspended, setIsSuspended] = useState(coach.isSuspended);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [minorNote, setMinorNote] = useState(coach.minorBackgroundCheckNote ?? "");
  const [minorNoteSaved, setMinorNoteSaved] = useState(Boolean(coach.minorBackgroundCheckNote));
  const [verifyMethod, setVerifyMethod] = useState(coach.ageIdentityVerificationMethod ?? "");
  const [verifiedAt, setVerifiedAt] = useState(coach.ageIdentityVerifiedAt);
  const [verifySaved, setVerifySaved] = useState(Boolean(coach.ageIdentityVerificationMethod));
  const [issued, setIssued] = useState<{ link: string; sendTo: string; expiresAt: string | null } | null>(null);

  const showMinor = minorCoachesEnabled && coach.isMinorCoach;
  // Mirrors the server rule in setIdVerificationStatus; the server is what actually enforces it.
  const approvalBlockedReason = coach.isMinorCoach
    ? !minorCoachesEnabled
      ? "Under 18 — the Minor Coach tier is off."
      : coach.consent?.status !== "COMPLETED"
        ? "Under 18 — needs completed parent/guardian consent first."
        : null
    : null;

  async function post(url: string, body?: unknown) {
    setActionError(null);
    setLoading(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) setActionError(data.error ?? "Something went wrong.");
    return res.ok ? data : null;
  }

  async function saveMinorNote() {
    if (await post(`/api/admin/coaches/${coach.id}/minor-verification`, { note: minorNote })) setMinorNoteSaved(true);
  }

  async function saveVerifyMethod() {
    const data = await post(`/api/admin/coaches/${coach.id}/age-identity-verification`, { method: verifyMethod });
    if (data) {
      setVerifySaved(true);
      setVerifiedAt(data.verifiedAt);
    }
  }

  async function issueLink(kind: "consent" | "revoke") {
    const data = await post(`/api/admin/coaches/${coach.id}/minor-consent-link`, { kind });
    if (data) setIssued({ link: data.link, sendTo: data.sendTo, expiresAt: data.expiresAt });
  }

  async function setId(status: "APPROVED" | "REJECTED") {
    if (await post(`/api/admin/coaches/${coach.id}/id-verification`, { status })) setIdStatus(status);
  }

  async function setBgc(status: "CLEAR" | "FLAGGED") {
    if (await post(`/api/admin/coaches/${coach.id}/background-check`, { status })) {
      setBgcStatus(status);
      setExpiresAt(status === "CLEAR" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null);
    }
  }

  async function unsuspend() {
    if (await post(`/api/admin/coaches/${coach.id}/unsuspend`)) setIsSuspended(false);
  }

  const expiryState = getBackgroundCheckExpiryState({
    backgroundCheckStatus: bgcStatus,
    backgroundCheckExpiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  const sig = coach.consent?.signature ?? null;

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
          {!showMinor && (
            <Badge variant={BGC_BADGE[bgcStatus]}>Background: {bgcStatus.toLowerCase().replace("_", " ")}</Badge>
          )}
          {expiryState === "RENEWAL_NEEDED" && (
            <Badge variant="warning">
              Expires {expiresAt ? new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
            </Badge>
          )}
          {expiryState === "EXPIRED" && <Badge variant="danger">Background check expired</Badge>}
          {isSuspended && <Badge variant="danger">Suspended — 3+ reports</Badge>}
          {showMinor && <Badge variant="accent">Minor Coach</Badge>}
          {showMinor && coach.consent && (
            <Badge variant={CONSENT_BADGE[coach.consent.status].variant}>{CONSENT_BADGE[coach.consent.status].label}</Badge>
          )}
        </div>

        {/* Every coach: date of birth and how age + identity were confirmed */}
        <div className="mt-3 flex flex-col gap-2 rounded-lg border-2 border-line bg-chalk p-3">
          <p className="text-xs text-muted-foreground">
            Date of birth:{" "}
            <span className="font-bold text-ink">{coach.dateOfBirth ?? "not recorded"}</span>
            {coach.ageLabel && <> · {coach.ageLabel}</>}
          </p>
          <label className="text-xs font-bold text-muted-foreground" htmlFor={`verify-${coach.id}`}>
            How age and identity were verified
          </label>
          <textarea
            id={`verify-${coach.id}`}
            rows={2}
            className={inputClass}
            placeholder="e.g. School ID name and DOB match signup; called parent at number on file"
            value={verifyMethod}
            onChange={(e) => {
              setVerifyMethod(e.target.value);
              setVerifySaved(false);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={saveVerifyMethod} disabled={loading || verifyMethod.trim().length < 3} className={secondaryButtonClass}>
              {verifySaved ? "Saved" : loading ? "Saving..." : "Save"}
            </button>
            {verifiedAt && (
              <span className="text-xs text-muted-foreground">
                Last recorded {stamp(verifiedAt)}
                {coach.ageIdentityVerifiedBy ? ` by ${coach.ageIdentityVerifiedBy}` : ""}
              </span>
            )}
          </div>
        </div>

        {showMinor && coach.consent && (
          <div className="mt-3 flex flex-col gap-3 rounded-lg border-2 border-line bg-chalk p-3">
            <p className="eyebrow text-muted-foreground">Parent/guardian consent</p>
            {coach.consent.status === "NONE" ? (
              <p className="text-sm text-muted-foreground">The coach hasn&apos;t named a parent or guardian yet.</p>
            ) : (
              <p className="text-sm text-ink">
                Latest link to <span className="font-bold">{coach.consent.guardianName}</span> ({coach.consent.guardianEmail}), sent{" "}
                {stamp(coach.consent.requestedAt)}
                {coach.consent.status === "PENDING" && `, expires ${stamp(coach.consent.expiresAt)}`}
                {coach.consent.status === "EXPIRED" && `, expired ${stamp(coach.consent.expiresAt)}`}.{" "}
                <span className="text-muted-foreground">{coach.consent.linksIssued} link(s) issued in total.</span>
              </p>
            )}

            {sig && (
              <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
                <dt className="font-bold text-muted-foreground">Signed</dt>
                <dd className="text-ink">{stamp(sig.signedAt)}</dd>
                <dt className="font-bold text-muted-foreground">Legal name</dt>
                <dd className="text-ink">{sig.signerLegalName} ({sig.signerRelationship})</dd>
                <dt className="font-bold text-muted-foreground">Typed signature</dt>
                <dd className="font-display text-base text-ink">{sig.typedSignature}</dd>
                <dt className="font-bold text-muted-foreground">Parent email</dt>
                <dd className="break-all text-ink">{sig.guardianEmail}</dd>
                <dt className="font-bold text-muted-foreground">Confirmed 18+</dt>
                <dd className="text-ink">{sig.confirmedAdult ? "Yes" : "No"}</dd>
                <dt className="font-bold text-muted-foreground">Emergency contact</dt>
                <dd className="text-ink">{sig.emergencyContactName} · {sig.emergencyContactPhone}</dd>
                <dt className="font-bold text-muted-foreground">Form version</dt>
                <dd className="text-ink">{sig.consentTextVersion} · {sig.acknowledgedKeys.length} statements ticked</dd>
                <dt className="font-bold text-muted-foreground">IP address</dt>
                <dd className="text-ink">{sig.signerIp ?? "not available"}</dd>
                <dt className="font-bold text-muted-foreground">Browser</dt>
                <dd className="break-all text-ink">{sig.signerUserAgent ?? "not available"}</dd>
                {sig.revokedAt && (
                  <>
                    <dt className="font-bold text-danger">Withdrawn</dt>
                    <dd className="text-danger">{stamp(sig.revokedAt)} (IP {sig.revokeIp ?? "not available"})</dd>
                  </>
                )}
              </dl>
            )}

            <div className="flex flex-wrap gap-2">
              {coach.consent.status !== "NONE" && coach.consent.status !== "COMPLETED" && (
                <button onClick={() => issueLink("consent")} disabled={loading} className={secondaryButtonClass}>
                  Create consent link to send manually
                </button>
              )}
              {coach.consent.status === "COMPLETED" && (
                <button onClick={() => issueLink("revoke")} disabled={loading} className={secondaryButtonClass}>
                  Create withdrawal link to send manually
                </button>
              )}
            </div>
            {issued && <IssuedLink {...issued} />}

            <label className="text-xs font-bold text-muted-foreground" htmlFor={`minor-note-${coach.id}`}>
              Alternative background verification used (standard background checks may not apply to minor coaches)
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
      <div className="flex flex-col gap-3 border-t-2 border-line pt-4 lg:w-[22rem] lg:border-l-2 lg:border-t-0 lg:pl-5 lg:pt-0">
        {actionError && <p role="alert" className={errorClass}>{actionError}</p>}
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
            <button
              onClick={() => setId("APPROVED")}
              disabled={loading || !coach.hasIdPhoto || Boolean(approvalBlockedReason)}
              aria-describedby={approvalBlockedReason ? `approve-blocked-${coach.id}` : undefined}
              className={primaryButtonClass}
            >
              Approve
            </button>
          )}
          {idStatus !== "REJECTED" && (
            <button onClick={() => setId("REJECTED")} disabled={loading} className={`${secondaryButtonClass} text-danger`}>
              Reject
            </button>
          )}
          {approvalBlockedReason && idStatus !== "APPROVED" && (
            <p id={`approve-blocked-${coach.id}`} className="w-full text-xs font-bold text-muted-foreground">
              {approvalBlockedReason}
            </p>
          )}
        </div>

        {!showMinor && (
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
        )}

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
