"use client";

import { useState } from "react";
import { primaryButtonClass, errorClass, successClass } from "@/lib/ui";

const RULES = [
  "Sessions are always held at a public location chosen by the parent — never a private residence.",
  "All communication with families happens through CoachConnect messaging — never share your phone number, email, or address.",
  "Never meet or communicate with a child without a parent or guardian's consent on file.",
  "Treat every family with respect. Harassment, discrimination, or inappropriate conduct results in permanent removal.",
  "Report anything that makes you uncomfortable using the Report button on any profile or conversation.",
];

export default function ConductAck({ initialAcknowledged }: { initialAcknowledged: boolean }) {
  const [acknowledged, setAcknowledged] = useState(initialAcknowledged);
  const [checked, setChecked] = useState(initialAcknowledged);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/coach/conduct-ack", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Something went wrong.");
      return;
    }
    setAcknowledged(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      {error && <p className={errorClass}>{error}</p>}
      {acknowledged ? (
        <p className={successClass}>You&apos;ve acknowledged CoachConnect&apos;s conduct rules.</p>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm text-secondary">
            <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            I have read and agree to follow CoachConnect&apos;s platform conduct rules.
          </label>
          <button onClick={save} className={`${primaryButtonClass} self-start`} disabled={!checked || loading}>
            {loading ? "Saving..." : "Confirm agreement"}
          </button>
        </>
      )}
    </div>
  );
}
