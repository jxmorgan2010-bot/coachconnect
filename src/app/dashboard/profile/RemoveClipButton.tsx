"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BioVideoClipType } from "@/lib/uploadRules";
import { quietLinkClass, errorClass } from "@/lib/ui";

/** Removes one bio video clip after a second tap to confirm. Removing deletes the file. */
export default function RemoveClipButton({ clipType, label }: { clipType: BioVideoClipType; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function remove() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/coach/upload-video", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Couldn't remove the clip.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3">
      {confirming ? (
        <>
          <button type="button" onClick={remove} disabled={busy} className={`${quietLinkClass} text-danger`}>
            {busy ? "Removing..." : `Yes, remove ${label.toLowerCase()} clip`}
          </button>
          {!busy && (
            <button type="button" onClick={() => setConfirming(false)} className={quietLinkClass}>
              Keep it
            </button>
          )}
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${quietLinkClass} text-danger`}>
          Remove<span className="sr-only"> {label.toLowerCase()} clip</span>
        </button>
      )}
      {error && <span role="alert" className={`${errorClass} w-full`}>{error}</span>}
    </span>
  );
}
