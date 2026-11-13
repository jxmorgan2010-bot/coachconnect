"use client";

import { useState } from "react";
import Link from "next/link";
import { errorClass, primaryButtonClass, quietLinkClass, successClass } from "@/lib/ui";

export default function RemoveButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/teen-interest/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Something went wrong. Please try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <>
        <p role="status" className={successClass}>You&apos;re off the list. We deleted your entry.</p>
        <Link href="/" className={`${quietLinkClass} text-pitch`}>Go to Assist Coaching</Link>
      </>
    );
  }

  return (
    <>
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={remove} className={primaryButtonClass} disabled={state === "loading"}>
          {state === "loading" ? "Removing..." : "Remove me"}
        </button>
        <Link href="/" className={`${quietLinkClass} px-2 text-pitch`}>Keep me on the list</Link>
      </div>
    </>
  );
}
