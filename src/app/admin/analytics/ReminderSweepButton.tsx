"use client";

import { useState } from "react";
import { primaryButtonClass, successClass } from "@/lib/ui";

export default function ReminderSweepButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent24h: number; sent1h: number } | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/system/send-reminders", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setResult({ sent24h: data.sent24h, sent1h: data.sent1h });
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={run} className={primaryButtonClass} disabled={loading}>
        {loading ? "Scanning bookings..." : "Run reminder sweep now"}
      </button>
      <p className="text-xs text-muted-foreground">
        In production, a real scheduler (e.g. Vercel Cron) would hit this on a timer — this button is a manual
        trigger for demo/testing. Reminders log to the server console (mock email).
      </p>
      {result && (
        <p className={successClass}>
          Sent {result.sent24h} 24-hour and {result.sent1h} 1-hour reminder(s).
        </p>
      )}
    </div>
  );
}
