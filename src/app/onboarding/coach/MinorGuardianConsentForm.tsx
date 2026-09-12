"use client";

import { useState } from "react";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";

export type MinorConsentState = {
  token: string | null;
  guardianName: string | null;
  guardianRelationship: string | null;
  consentedAt: string | null;
};

export default function MinorGuardianConsentForm({ initial }: { initial: MinorConsentState }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const signed = Boolean(state.consentedAt);

  async function requestConsent() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/coach/minor-consent-request", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setState((prev) => ({ ...prev, token: data.token }));
  }

  function linkFor(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/minor-consent/${token}`;
  }

  function copy() {
    if (!state.token) return;
    navigator.clipboard?.writeText(linkFor(state.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (signed) {
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="success">Signed</Badge>
        <p className="text-sm text-muted-foreground">
          Consent on file from {state.guardianName} ({state.guardianRelationship}), signed{" "}
          {state.consentedAt
            ? new Date(state.consentedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : ""}
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Because you&apos;re under 18, your own parent or legal guardian must sign a consent form before your
        profile can be reviewed — separate from the consent a booking family gives when they book a session with
        you. Generate a link below and send it to them; they fill out and sign it themselves.
      </p>
      {error && <p className={errorClass}>{error}</p>}

      {!state.token ? (
        <button onClick={requestConsent} className={`${secondaryButtonClass} self-start`} disabled={loading}>
          {loading ? "Creating link..." : "+ Get parent/guardian consent link"}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-secondary">Awaiting your parent/guardian&apos;s signature</span>
            <Badge>Requested</Badge>
          </div>
          <button type="button" onClick={copy} className="self-start text-xs font-semibold text-primary">
            {copied ? "Link copied!" : "Copy link to send them"}
          </button>
        </div>
      )}
    </div>
  );
}
