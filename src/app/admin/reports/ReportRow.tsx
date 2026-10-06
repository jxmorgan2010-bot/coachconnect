"use client";

import { useState } from "react";
import Badge from "@/components/Badge";
import { secondaryButtonClass, primaryButtonClass } from "@/lib/ui";

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
const STATUS_LABEL = { OPEN: "Open", REVIEWED: "Reviewed", DISMISSED: "Dismissed" } as const;
const TYPE_LABEL: Record<string, string> = {
  COACH_PROFILE: "Coach profile",
  PARENT_PROFILE: "Parent profile",
  MESSAGE: "Message thread",
  SUPPORT_REQUEST: "Support request",
};

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
    <div className={`${status === "OPEN" ? "card" : "card-flat"} flex flex-col gap-3 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow mb-1 text-muted-foreground">{TYPE_LABEL[report.targetType] ?? report.targetType}</p>
          <p className="font-bold text-ink">{report.target}</p>
        </div>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </div>
      <p className="text-sm text-ink">
        <span className="font-bold">{report.reason}</span>
        <span className="text-muted-foreground"> · reported by {report.reporterName} on {report.createdAt}</span>
      </p>
      {report.details && (
        <p className="border-l-4 border-gold pl-3 text-sm text-muted-foreground">{report.details}</p>
      )}
      {status === "OPEN" && (
        <div className="flex flex-wrap gap-2 border-t-2 border-line pt-3">
          <button onClick={() => updateStatus("REVIEWED")} disabled={loading} className={primaryButtonClass}>
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
