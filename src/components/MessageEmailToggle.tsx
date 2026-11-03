"use client";

import { useState } from "react";
import { errorClass } from "@/lib/ui";

/** "Email me about new messages", saved as soon as it's ticked. Account and booking emails always send. */
export default function MessageEmailToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function change(next: boolean) {
    setOn(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/account/email-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageEmailAlerts: next }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setOn(!next);
      setError("That didn't save. Try again.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--pitch)]"
          checked={on}
          disabled={saving}
          onChange={(e) => change(e.target.checked)}
        />
        <span>
          <span className="font-bold">Email me about new messages.</span> At most one email an hour per conversation, with
          a link to read it here. The email never includes the message itself.
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        Account and booking emails (confirmations, cancellations, refunds, password resets) always send.
      </p>
      <span className="sr-only" aria-live="polite">
        {saved ? (on ? "Message emails on" : "Message emails off") : ""}
      </span>
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </div>
  );
}
