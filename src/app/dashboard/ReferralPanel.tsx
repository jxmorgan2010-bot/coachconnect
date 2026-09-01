"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { secondaryButtonClass } from "@/lib/ui";

export default function ReferralPanel({ code, creditCents }: { code: string; creditCents: number }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    const link = `${window.location.origin}/signup/parent?ref=${code}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card flex flex-col gap-2 p-5">
      <p className="font-display text-lg text-ink">Give $10, get $10</p>
      <p className="text-sm text-muted-foreground">
        Share your code — when a new parent signs up with it, you both get $10 off your next booking.
      </p>
      <div className="flex items-center gap-2">
        <code className="rounded-lg border-2 border-ink bg-muted px-3 py-1.5 font-display text-lg tracking-wide text-ink">
          {code}
        </code>
        <button onClick={copyLink} className={secondaryButtonClass}>
          {copied ? "Link copied!" : "Copy invite link"}
        </button>
      </div>
      {creditCents > 0 && (
        <p className="text-sm font-bold text-pitch">
          You have {formatCents(creditCents)} in credit — it&apos;ll apply automatically at your next booking.
        </p>
      )}
    </div>
  );
}
