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
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="-mr-2 grid h-11 w-11 place-items-center rounded-md text-2xl leading-none text-muted-foreground hover:text-ink"
                >
                  &times;
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tell us what&apos;s going on with a session or your account — a no-show, a billing question, anything.
              </p>
              {error && <p className={errorClass}>{error}</p>}
              <textarea
                aria-label="Your message to support"
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
        // Icon-only on phones so it doesn't sit on top of form fields (zip, card, etc.)
        <button
          onClick={() => setOpen(true)}
          className="press flex h-12 w-12 items-center justify-center gap-2 rounded-full border-2 border-ink bg-primary text-sm font-bold text-primary-foreground shadow-patch-sm hover:bg-pitch-bright sm:h-auto sm:w-auto sm:px-4 sm:py-3"
        >
          <IconMessage className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Need help?</span>
        </button>
      )}
    </div>
  );
}
