"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorClass, primaryButtonClass, secondaryButtonClass, successClass } from "@/lib/ui";

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

/** Marks replaced email text as looked at (POST /api/admin/email-replacements/[id]/review). */
export function ReviewReplacementButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/email-replacements/${id}/review`, { method: "POST" });
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
      <button type="button" onClick={review} className={secondaryButtonClass} disabled={loading}>
        {loading ? "Saving..." : "Mark reviewed"}
      </button>
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}

/**
 * For an email that never went out: Retry (POST /api/admin/email-failures/[id]/retry) when it can
 * be rebuilt, and Mark reviewed (.../review) either way.
 */
export function EmailFailureButtons({ id, canRetry, lastRetryError }: { id: string; canRetry: boolean; lastRetryError: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(action: "retry" | "review") {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/admin/email-failures/${id}/${action}`, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(null);
    if (!res?.ok) setError(data?.error ?? "Something went wrong.");
    // Refresh either way: a failed retry updates the row's last error and count.
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {canRetry && (
          <button type="button" onClick={() => post("retry")} className={primaryButtonClass} disabled={busy !== null}>
            {busy === "retry" ? "Sending..." : "Retry"}
          </button>
        )}
        <button type="button" onClick={() => post("review")} className={secondaryButtonClass} disabled={busy !== null}>
          {busy === "review" ? "Saving..." : "Mark reviewed"}
        </button>
      </div>
      {/* A failed retry's reason is saved and shown in the row above after the refresh; don't repeat it */}
      {error && error !== lastRetryError && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
    </div>
  );
}
