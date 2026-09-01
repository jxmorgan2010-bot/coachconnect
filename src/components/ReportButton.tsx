"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { IconFlag } from "@/components/icons";
import { secondaryButtonClass, primaryButtonClass, inputClass, errorClass, successClass } from "@/lib/ui";

export default function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "COACH_PROFILE" | "PARENT_PROFILE" | "MESSAGE";
  targetId: string;
}) {
  const { status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpen() {
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reason, details }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
  }

  if (!open) {
    return (
      <button type="button" onClick={handleOpen} className={`${secondaryButtonClass} text-danger`}>
        <IconFlag className="h-4 w-4" /> Report
      </button>
    );
  }

  return (
    <div className="card w-full max-w-sm p-4">
      {submitted ? (
        <p className={successClass}>Thanks — our team will review this report.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          {error && <p className={errorClass}>{error}</p>}
          <p className="font-display text-lg text-ink">Report this profile</p>
          <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="" disabled>Select a reason...</option>
            <option value="Inappropriate behavior">Inappropriate behavior</option>
            <option value="Suspicious profile">Suspicious profile</option>
            <option value="Shared personal contact info">Shared personal contact info</option>
            <option value="Other safety concern">Other safety concern</option>
          </select>
          <textarea
            className={inputClass}
            rows={3}
            placeholder="Add any details (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={loading}>
              {loading ? "Submitting..." : "Submit report"}
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
