"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass } from "@/lib/ui";

async function post(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : ((data.error as string | undefined) ?? "Something went wrong.");
}

/**
 * Amount + required reason, posted as { amountCents, reason, ...extra }. Used for session
 * refunds (full or partial) and for refunding a package's unused sessions.
 */
export function RefundForm({
  endpoint,
  extra = {},
  defaultCents,
  maxCents,
  buttonLabel = "Issue refund",
}: {
  endpoint: string;
  extra?: Record<string, unknown>;
  defaultCents: number;
  maxCents: number;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [dollars, setDollars] = useState((defaultCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const failed = await post(endpoint, { ...extra, amountCents: Math.round(Number(dollars) * 100), reason });
    setLoading(false);
    if (failed) return setError(failed);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={labelClass} htmlFor={`${id}-amount`}>
            Amount ($) <span className="font-normal text-muted-foreground">up to {formatCents(maxCents)}</span>
          </label>
          <input
            id={`${id}-amount`}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            max={(maxCents / 100).toFixed(2)}
            className={`${inputClass} w-32`}
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            required
          />
        </div>
        <div className="min-w-0 flex-1 basis-56">
          <label className={labelClass} htmlFor={`${id}-reason`}>Reason</label>
          <input id={`${id}-reason`} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? "Refunding..." : buttonLabel}
        </button>
      </div>
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </form>
  );
}

/** Waive a late-cancellation charge: reason only, posted as { reason, ...extra }. */
export function WaiveForm({ endpoint, extra = {}, outcome }: { endpoint: string; extra?: Record<string, unknown>; outcome: string }) {
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const failed = await post(endpoint, { ...extra, reason });
    setLoading(false);
    if (failed) return setError(failed);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{outcome}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label className={labelClass} htmlFor={`${id}-reason`}>Reason for waiving</label>
          <input
            id={`${id}-reason`}
            className={inputClass}
            placeholder="e.g. family emergency, field closed for weather"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading} className={secondaryButtonClass}>
          {loading ? "Waiving..." : "Waive charge"}
        </button>
      </div>
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </form>
  );
}
