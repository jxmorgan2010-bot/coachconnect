"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { quietLinkClass, secondaryButtonClass } from "@/lib/ui";

// bonusCents is passed in from the server — lib/referral imports node:crypto.
export default function ReferralPanel({
  code,
  creditCents,
  bonusCents,
  referralPending,
}: {
  code: string;
  creditCents: number;
  bonusCents: number;
  /** This parent signed up with someone's code and hasn't finished a paid session yet. */
  referralPending: boolean;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const bonus = formatCents(bonusCents).replace(".00", "");

  function copy(what: "code" | "link") {
    const text = what === "code" ? code : `${window.location.origin}/signup/parent?ref=${code}`;
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="card-flat flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl leading-none text-ink">
        Give {bonus}, get {bonus}
      </h2>
      <p className="text-sm text-muted-foreground">
        Share your code. A new parent enters it in the Referral code box when they sign up. After their first
        session is paid and marked complete, you each get {bonus} in credit.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex min-h-11 items-center rounded-lg border-2 border-dashed border-ink bg-chalk px-3 font-display text-xl tracking-widest text-ink">
          {code}
        </code>
        <button type="button" onClick={() => copy("code")} className={secondaryButtonClass}>
          {copied === "code" ? "Code copied!" : "Copy code"}
        </button>
      </div>
      <button type="button" onClick={() => copy("link")} className={`${quietLinkClass} self-start text-pitch`}>
        {copied === "link" ? "Invite link copied!" : "Or copy an invite link"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied === "code" ? "Referral code copied" : copied === "link" ? "Invite link copied" : ""}
      </span>
      {referralPending && (
        <p className="text-sm text-ink">
          You signed up with a referral code. Your {bonus} credit arrives after your first paid session is marked
          complete.
        </p>
      )}
      {creditCents > 0 && (
        <p className="text-sm font-bold text-pitch">
          You have {formatCents(creditCents)} in credit. It&apos;ll apply automatically at your next booking.
        </p>
      )}
    </div>
  );
}
