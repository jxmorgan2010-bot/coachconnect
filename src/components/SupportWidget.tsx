"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { IconMessage } from "@/components/icons";
import { inputClass, primaryButtonClass, secondaryButtonClass, errorClass, successClass } from "@/lib/ui";

export default function SupportWidget() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (status !== "authenticated") return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
  }

  function close() {
    setOpen(false);
    setSubmitted(false);
    setMessage("");
    setError(null);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="card w-80 max-w-[calc(100vw-2rem)] p-4">
          {submitted ? (
            <>
              <p className={successClass}>Thanks — we got your message and someone will follow up by email.</p>
              <button onClick={close} className={`${secondaryButtonClass} mt-3`}>
                Close
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg text-ink">Need help?</p>
                <button type="button" onClick={close} aria-label="Close" className="text-xl leading-none text-muted-foreground">
                  &times;
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tell us what&apos;s going on with a session or your account — a no-show, a billing question, anything.
              </p>
              {error && <p className={errorClass}>{error}</p>}
              <textarea
                className={inputClass}
                rows={4}
                placeholder="What's going on?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              <button type="submit" className={primaryButtonClass} disabled={loading}>
                {loading ? "Sending..." : "Send to support"}
              </button>
            </form>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="press flex items-center gap-2 rounded-full border-2 border-ink bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[4px_4px_0_var(--ink)] hover:bg-pitch-bright"
        >
          <IconMessage className="h-4 w-4" />
          Need help?
        </button>
      )}
    </div>
  );
}
