"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** PATCH /api/admin/teen-interest/[id]. */
export default function ContactedCheckbox({ id, contactedAt }: { id: string; contactedAt: string | null }) {
  const router = useRouter();
  const [checked, setChecked] = useState(contactedAt !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setChecked(next);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/teen-interest/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacted: next }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setChecked(!next);
      setError(data?.error ?? "Couldn't save. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold text-ink">
        <input
          type="checkbox"
          checked={checked}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
          className="h-5 w-5 accent-[var(--pitch)]"
        />
        Contacted
      </label>
      {checked && contactedAt && <span className="text-sm text-muted-foreground">on {contactedAt}</span>}
      {error && (
        <span role="alert" className="text-sm font-semibold text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
