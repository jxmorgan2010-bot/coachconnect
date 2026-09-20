"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, primaryButtonClass, errorClass, successClass } from "@/lib/ui";
import { formatCents } from "@/lib/money";
import { pointsToCreditCents, POINTS_PER_DOLLAR_REDEMPTION } from "@/lib/points";

export default function PointsRedeemForm({ pointsBalance }: { pointsBalance: number }) {
  const router = useRouter();
  const [points, setPoints] = useState(Math.min(pointsBalance, POINTS_PER_DOLLAR_REDEMPTION));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);

  const previewCreditCents = pointsToCreditCents(points);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/points/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSuccess(data.creditCents);
    router.refresh();
  }

  if (pointsBalance < POINTS_PER_DOLLAR_REDEMPTION) {
    return <p className="text-sm text-muted-foreground">Earn {POINTS_PER_DOLLAR_REDEMPTION} points to redeem your first dollar of credit.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {error && <p className={errorClass}>{error}</p>}
      {success !== null && <p className={successClass}>Redeemed! {formatCents(success)} in credit added.</p>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={POINTS_PER_DOLLAR_REDEMPTION}
          max={pointsBalance}
          step={1}
          className={inputClass}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
        />
        <span className="whitespace-nowrap text-sm text-muted-foreground">= {formatCents(previewCreditCents)}</span>
      </div>
      <button type="submit" className={primaryButtonClass} disabled={loading}>
        {loading ? "Redeeming..." : "Redeem for credit"}
      </button>
    </form>
  );
}
