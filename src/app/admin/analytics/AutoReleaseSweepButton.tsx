"use client";

import { useState } from "react";
import { primaryButtonClass, successClass } from "@/lib/ui";
import { AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";

export default function AutoReleaseSweepButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ releasedCount: number } | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/system/auto-release", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setResult({ releasedCount: data.releasedCount });
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={run} className={primaryButtonClass} disabled={loading}>
        {loading ? "Scanning bookings..." : "Run auto-release sweep now"}
      </button>
      <p className="text-xs text-muted-foreground">
        Auto-completes and captures payment for confirmed sessions the parent hasn&apos;t confirmed or disputed within{" "}
        {AUTO_RELEASE_GRACE_HOURS} hours of their scheduled end. Manual trigger for demo/testing.
      </p>
      {result && <p className={successClass}>Auto-released {result.releasedCount} session(s).</p>}
    </div>
  );
}
