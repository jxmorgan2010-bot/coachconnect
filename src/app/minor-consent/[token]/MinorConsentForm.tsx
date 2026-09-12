"use client";

import { useState } from "react";
import { inputClass, labelClass, primaryButtonClass, errorClass, successClass } from "@/lib/ui";

export default function MinorConsentForm({
  token,
  coachName,
  alreadySigned,
}: {
  token: string;
  coachName: string;
  alreadySigned: boolean;
}) {
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(alreadySigned);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consented) {
      setError("Check the box to confirm your consent.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/minor-consent/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guardianName, guardianRelationship, guardianEmail, consented }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return <p className={successClass}>Thanks — your consent has been recorded for {coachName}&apos;s profile.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-5">
      {error && <p className={errorClass}>{error}</p>}

      <div>
        <label className={labelClass} htmlFor="guardianName">Your full name</label>
        <input id="guardianName" className={inputClass} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} required />
      </div>
      <div>
        <label className={labelClass} htmlFor="guardianRelationship">Your relationship to {coachName}</label>
        <input
          id="guardianRelationship"
          className={inputClass}
          placeholder="e.g. Parent, Legal guardian"
          value={guardianRelationship}
          onChange={(e) => setGuardianRelationship(e.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="guardianEmail">Your email</label>
        <input id="guardianEmail" type="email" className={inputClass} value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} required />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="mt-1" checked={consented} onChange={(e) => setConsented(e.target.checked)} required />
        I am the parent/legal guardian named above, and I consent to {coachName} creating and holding a coach
        profile on CoachConnect.
      </label>

      <button type="submit" className={primaryButtonClass} disabled={loading}>
        {loading ? "Submitting..." : "Sign consent"}
      </button>
    </form>
  );
}
