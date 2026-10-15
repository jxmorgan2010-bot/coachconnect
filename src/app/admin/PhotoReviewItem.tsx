"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { primaryButtonClass, secondaryButtonClass, errorClass, successClass } from "@/lib/ui";

export type PhotoReviewData = {
  coachProfileId: string;
  name: string;
  currentUrl: string | null;
  pendingUrl: string;
  uploadedAt: string | null;
};

function Photo({ url, label, alt }: { url: string | null; label: string; alt: string }) {
  return (
    <figure className="flex flex-col items-center gap-1.5">
      <div className="relative grid h-32 w-28 place-items-center overflow-hidden rounded-xl border-2 border-ink bg-muted">
        {url ? (
          <Image src={url} alt={alt} fill sizes="112px" className="object-cover" />
        ) : (
          <span className="px-2 text-center text-xs font-bold text-muted-foreground">No photo yet</span>
        )}
      </div>
      <figcaption className="eyebrow text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** A coach's new profile photo beside the one families see now, with approve / reject. */
export default function PhotoReviewItem({ photo }: { photo: PhotoReviewData }) {
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function decide(action: "approve" | "reject") {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/admin/coaches/${photo.coachProfileId}/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, url: photo.pendingUrl }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setResult(action === "approve" ? "approved" : "rejected");
  }

  return (
    <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex gap-4">
        <Photo url={photo.currentUrl} label="Now" alt={`${photo.name}'s current profile photo`} />
        <Photo url={photo.pendingUrl} label="New" alt={`${photo.name}'s new profile photo`} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <Link
            href={`/coaches/${photo.coachProfileId}`}
            className="inline-flex min-h-11 items-center font-display text-2xl leading-tight text-ink underline-offset-4 hover:underline"
          >
            {photo.name}
          </Link>
          {photo.uploadedAt && (
            <p className="text-xs text-muted-foreground">
              Uploaded{" "}
              {new Date(photo.uploadedAt).toLocaleString("en-US", {
                timeZone: "America/Los_Angeles",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              PT
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Approve if it&apos;s a clear photo of the coach alone, with no contact details, logos or anything a family
          shouldn&apos;t see.
        </p>
        {error && <p role="alert" className={errorClass}>{error}</p>}
        {result ? (
          <p role="status" className={successClass}>
            {result === "approved" ? "Approved. It's now on their profile." : "Rejected. Their current photo stays."}
          </p>
        ) : (
          <div role="group" aria-label={`Photo actions for ${photo.name}`} className="flex flex-wrap gap-2">
            <button type="button" onClick={() => decide("approve")} disabled={loading} className={primaryButtonClass}>
              Approve photo
            </button>
            <button type="button" onClick={() => decide("reject")} disabled={loading} className={`${secondaryButtonClass} text-danger`}>
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
