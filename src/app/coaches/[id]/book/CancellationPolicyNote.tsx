"use client";

import { useState } from "react";
import { freeCancelPolicyText, parentCancelOutcome } from "@/lib/cancellation";

/**
 * The cancellation policy at booking, for the chosen start time. A session whose free-cancel
 * deadline has already passed (today, or tomorrow after midnight) gets a plain warning
 * before the parent pays, since cancelling it will never be free.
 */
export default function CancellationPolicyNote({ startsAt, isPackage }: { startsAt: string; isPackage: boolean }) {
  // Fixed when the form loads; the server re-checks the deadline at cancel time anyway.
  const [now] = useState(() => new Date());
  const lateCost = isPackage ? "the session counts as used from your package" : "you're charged the full price";

  if (!startsAt) {
    return (
      <p className="rounded-lg border-2 border-line bg-surface p-3 text-sm text-ink">
        <span className="font-bold">Free cancellation until 11:59 PM PT the night before.</span> After that, {lateCost}. If
        the coach cancels or doesn&apos;t show, you&apos;re never charged.
      </p>
    );
  }

  const start = new Date(startsAt);
  if (parentCancelOutcome(start, now) === "LATE") {
    return (
      <p className="rounded-lg border-2 border-ink bg-warning/15 p-3 text-sm text-ink">
        <span className="font-bold">This session is past the free-cancellation deadline.</span> If you cancel it after
        booking, {lateCost}. If the coach cancels or doesn&apos;t show, you&apos;re never charged.
      </p>
    );
  }
  return (
    <p className="rounded-lg border-2 border-line bg-surface p-3 text-sm text-ink">
      <span className="font-bold">{freeCancelPolicyText(start)}.</span> After that, {lateCost}. If the coach cancels or
      doesn&apos;t show, you&apos;re never charged.
    </p>
  );
}
