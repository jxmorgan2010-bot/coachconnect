"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass } from "@/lib/ui";

export type MinorConsentSummary = {
  status: "NONE" | "PENDING" | "EXPIRED" | "COMPLETED" | "REVOKED";
  guardianName: string | null;
  guardianEmail: string | null;
  requestedAt: string | null;
  expiresAt: string | null;
  signedByName: string | null;
  signedRelationship: string | null;
  signedAt: string | null;
  revokedAt: string | null;
};

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

/**
 * The teen names a parent/guardian and CoachConnect sends them the consent link. The teen
 * never sees the link itself — only the parent should be able to open and sign it.
 */
export default function MinorGuardianConsentForm({ initial, coachEmail }: { initial: MinorConsentSummary; coachEmail: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  const [formOpen, setFormOpen] = useState(initial.status === "NONE");
  const [guardianName, setGuardianName] = useState(initial.guardianName ?? "");
  const [guardianEmail, setGuardianEmail] = useState(initial.guardianEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (guardianEmail.trim().toLowerCase() === coachEmail.trim().toLowerCase()) {
      setError("Your parent or guardian's email has to be different from your own email.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/coach/minor-consent-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guardianName, guardianEmail }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSummary({ ...summary, ...data.consent, signedByName: null, signedRelationship: null, signedAt: null, revokedAt: null });
    setFormOpen(false);
    router.refresh();
  }

  if (summary.status === "COMPLETED") {
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge variant="success">Signed</Badge>
        <p className="text-sm text-muted-foreground">
          {summary.signedByName} ({summary.signedRelationship?.toLowerCase()}) signed on {day(summary.signedAt)}. You can
          now upload your school ID and photos.
        </p>
      </div>
    );
  }

  const isResend = summary.status !== "NONE";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Because you&apos;re under 18, your parent or legal guardian has to read and sign a consent form before you can
        upload your school ID or photos, and before our team can review your profile. This is separate from the
        consent a family gives when they book you.
      </p>

      {summary.status === "PENDING" && (
        <div className="flex flex-col gap-1 rounded-lg border-2 border-line bg-chalk p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">Waiting for signature</Badge>
          </div>
          <p className="text-ink">
            Sent to {summary.guardianName} ({summary.guardianEmail}) on {day(summary.requestedAt)}. The link works once
            and expires {day(summary.expiresAt)}.
          </p>
        </div>
      )}

      {summary.status === "EXPIRED" && (
        <div className="flex flex-col gap-1 rounded-lg border-2 border-line bg-chalk p-3 text-sm">
          <Badge variant="danger">Link expired</Badge>
          <p className="text-ink">
            The link sent to {summary.guardianName} expired on {day(summary.expiresAt)} before it was signed. Send a new
            one below.
          </p>
        </div>
      )}

      {summary.status === "REVOKED" && (
        <div className="flex flex-col gap-1 rounded-lg border-2 border-ink bg-danger/10 p-3 text-sm">
          <Badge variant="danger">Consent withdrawn</Badge>
          <p className="text-ink">
            {summary.guardianName} withdrew their consent on {day(summary.revokedAt)}, so your profile is hidden from
            families. If they change their mind, you can send them a new request.
          </p>
        </div>
      )}

      {error && <p role="alert" className={errorClass}>{error}</p>}

      {formOpen || summary.status === "EXPIRED" || summary.status === "REVOKED" ? (
        <form onSubmit={send} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="guardianName">Parent or guardian&apos;s full name</label>
              <input id="guardianName" className={inputClass} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass} htmlFor="guardianEmail">Their email</label>
              <input
                id="guardianEmail"
                type="email"
                className={inputClass}
                value={guardianEmail}
                onChange={(e) => setGuardianEmail(e.target.value)}
                aria-describedby="guardianEmail-help"
                required
              />
            </div>
          </div>
          <p id="guardianEmail-help" className="-mt-1 text-xs text-muted-foreground">
            Use their own email, not yours. CoachConnect will send them a link to read and sign the form.
            {isResend && " Sending a new link stops the old one from working."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButtonClass} disabled={loading}>
              {loading ? "Sending..." : isResend ? "Send a new link" : "Send consent request"}
            </button>
            {summary.status === "PENDING" && (
              <button type="button" className={secondaryButtonClass} onClick={() => setFormOpen(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" className={`${secondaryButtonClass} self-start`} onClick={() => setFormOpen(true)}>
          Send a new link
        </button>
      )}
    </div>
  );
}
