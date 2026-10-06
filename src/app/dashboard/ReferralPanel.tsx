"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { secondaryButtonClass } from "@/lib/ui";

// bonusCents is passed in from the server — lib/referral imports node:crypto.
export default function ReferralPanel({
  code,
  creditCents,
  bonusCents,
}: {
  code: string;
  creditCents: number;
  bonusCents: number;
}) {
  const [copied, setCopied] = useState(false);
  const bonus = formatCents(bonusCents).replace(".00", "");

  function copyLink() {
    const link = `${window.location.origin}/signup/parent?ref=${code}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card-flat flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl leading-none text-ink">
        Give {bonus}, get {bonus}
      </h2>
      <p className="text-sm text-muted-foreground">
        Share your code. When a new parent signs up with it, you both get {bonus} off your next booking.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex min-h-11 items-center rounded-lg border-2 border-dashed border-ink bg-chalk px-3 font-display text-xl tracking-widest text-ink">
          {code}
        </code>
        <button onClick={copyLink} className={secondaryButtonClass}>
          {copied ? "Link copied!" : "Copy invite link"}
        </button>
        <span className="sr-only" aria-live="polite">{copied ? "Invite link copied" : ""}</span>
      </div>
      {creditCents > 0 && (
        <p className="text-sm font-bold text-pitch">
          You have {formatCents(creditCents)} in credit. It&apos;ll apply automatically at your next booking.
        </p>
      )}
    </div>
  );
}
