"use client";

import { useState } from "react";
import { primaryButtonClass, secondaryButtonClass, errorClass } from "@/lib/ui";

export default function RevokeConsentForm({ token, coachFirstName }: { token: string; coachFirstName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ cancelledSessions: number } | null>(null);

  async function revoke() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/minor-consent/revoke/${token}`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDone({ cancelledSessions: data.cancelledSessions ?? 0 });
  }

  if (done) {
    return (
      <p role="status" className="rounded-lg border-2 border-ink bg-chalk px-4 py-3 text-ink">
        Consent withdrawn. {coachFirstName}&apos;s profile is hidden from families
        {done.cancelledSessions > 0
          ? `, and ${done.cancelledSessions} upcoming session${done.cancelledSessions === 1 ? " was" : "s were"} cancelled.`
          : "."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className={errorClass}>{error}</p>}
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-danger/10 p-4">
          <p className="font-bold text-ink">Withdraw consent now?</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={revoke} disabled={loading} className={primaryButtonClass}>
              {loading ? "Withdrawing..." : "Yes, withdraw consent"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={loading} className={secondaryButtonClass}>
              Keep consent
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${secondaryButtonClass} self-start text-danger`}>
          Withdraw consent
        </button>
      )}
    </div>
  );
}
