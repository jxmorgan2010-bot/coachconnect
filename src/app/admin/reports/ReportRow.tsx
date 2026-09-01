"use client";

import { useState } from "react";
import Badge from "@/components/Badge";
import { secondaryButtonClass } from "@/lib/ui";

type ReportData = {
  id: string;
  reporterName: string;
  target: string;
  targetType: string;
  reason: string;
  details: string | null;
  status: "OPEN" | "REVIEWED" | "DISMISSED";
  createdAt: string;
};

const STATUS_VARIANT = { OPEN: "warning", REVIEWED: "success", DISMISSED: "neutral" } as const;

export default function ReportRow({ report }: { report: ReportData }) {
  const [status, setStatus] = useState(report.status);
  const [loading, setLoading] = useState(false);

  async function updateStatus(next: "REVIEWED" | "DISMISSED") {
    setLoading(true);
    const res = await fetch(`/api/admin/reports/${report.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (res.ok) setStatus(next);
  }

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-ink">{report.target}</p>
        <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
      </div>
      <p className="text-sm text-ink">
        <span className="font-bold">{report.reason}</span> — reported by {report.reporterName} on {report.createdAt}
      </p>
      {report.details && <p className="text-sm text-muted-foreground">{report.details}</p>}
      {status === "OPEN" && (
        <div className="flex gap-2">
          <button onClick={() => updateStatus("REVIEWED")} disabled={loading} className={secondaryButtonClass}>
            Mark reviewed
          </button>
          <button onClick={() => updateStatus("DISMISSED")} disabled={loading} className={secondaryButtonClass}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
