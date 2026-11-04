"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorClass, secondaryButtonClass, successClass } from "@/lib/ui";

/** Runs one job now (POST /api/admin/jobs/[slug]), logged with trigger ADMIN. */
export function RunJobButton({ slug, label }: { slug: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    const res = await fetch(`/api/admin/jobs/${slug}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    setResult(
      res.ok && data.ok
        ? { ok: true, text: `${data.summary}${data.failed ? ` ${data.failed} failed.` : ""}` }
        : { ok: false, text: data.error ?? data.summary ?? "The run failed. See the run log below." },
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={run} className={secondaryButtonClass} disabled={loading}>
        {loading ? "Running..." : `Run ${label.toLowerCase()} now`}
      </button>
      {result && (
        <p role="status" className={result.ok ? successClass : errorClass}>
          {result.text}
        </p>
      )}
    </div>
  );
}

/** Marks a flagged booking handled (POST /api/admin/bookings/[id]/clear-flag). */
export function ClearFlagButton({ bookingId, retries }: { bookingId: string; retries: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clear() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/clear-flag`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={clear} className={secondaryButtonClass} disabled={loading}>
        {loading ? "Saving..." : retries ? "Mark handled (retries the charge)" : "Mark handled"}
      </button>
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
