"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, secondaryButtonClass, primaryButtonClass, errorClass, successClass } from "@/lib/ui";

export default function DisputeButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <p className={successClass}>Case opened — an admin will review it.</p>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${secondaryButtonClass} text-danger`}>
        Report a problem
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-danger/10 p-3">
      {error && <p className={errorClass}>{error}</p>}
      <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required>
        <option value="" disabled>What happened?</option>
        <option value="NO_SHOW">Coach didn&apos;t show up</option>
        <option value="DISSATISFIED">Not satisfied with the session</option>
        <option value="OTHER">Other issue</option>
      </select>
      <textarea
        className={inputClass}
        rows={3}
        placeholder="Give admins a few details"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        required
      />
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Submitting..." : "Open case"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
