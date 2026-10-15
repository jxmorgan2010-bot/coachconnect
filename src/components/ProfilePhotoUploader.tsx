"use client";

import { useState } from "react";
import Image from "next/image";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";
import { uploadCoachFile } from "@/lib/coachUpload";

/**
 * A coach's profile photo and its review state. New uploads wait for an admin
 * (lib/profilePhoto.ts), so this shows the approved photo and the pending one separately.
 */
export default function ProfilePhotoUploader({
  approvedUrl,
  pendingUrl: initialPendingUrl,
  rejected: initialRejected,
  onUploaded,
}: {
  approvedUrl: string | null;
  pendingUrl: string | null;
  /** An admin turned down the last upload and nothing newer is waiting. */
  rejected: boolean;
  onUploaded?: (pendingUrl: string) => void;
}) {
  const [pendingUrl, setPendingUrl] = useState(initialPendingUrl);
  const [rejected, setRejected] = useState(initialRejected && !initialPendingUrl);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    const result = await uploadCoachFile("photo", file, { onProgress: setProgress });
    setProgress(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.url) {
      setPendingUrl(result.url);
      setRejected(false);
      onUploaded?.(result.url);
    }
  }

  const badge = pendingUrl ? (
    <Badge variant="warning">Waiting for approval</Badge>
  ) : rejected ? (
    <Badge variant="danger">Not approved</Badge>
  ) : approvedUrl ? (
    <Badge variant="success">Approved</Badge>
  ) : (
    <Badge>Not uploaded</Badge>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">{badge}</div>

      <div className="flex flex-wrap gap-4">
        {approvedUrl && (
          <figure className="flex flex-col items-center gap-1.5">
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-ink">
              <Image src={approvedUrl} alt="Your current profile photo" fill sizes="112px" className="object-cover" />
            </div>
            <figcaption className="text-xs font-bold text-muted-foreground">Families see this</figcaption>
          </figure>
        )}
        {pendingUrl && (
          <figure className="flex flex-col items-center gap-1.5">
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-dashed border-ink">
              <Image src={pendingUrl} alt="Your new profile photo, waiting for approval" fill sizes="112px" className="object-cover" />
            </div>
            <figcaption className="text-xs font-bold text-muted-foreground">New, not public yet</figcaption>
          </figure>
        )}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {pendingUrl
          ? approvedUrl
            ? "Our team checks every new photo. Your current photo stays on your profile until the new one is approved."
            : "Our team checks every new photo. Families see a placeholder until it's approved."
          : rejected
            ? `Your last photo wasn't approved${approvedUrl ? ", so your current one is still showing" : ""}. Try a clear, friendly photo of just you.`
            : "Shown publicly on your coach profile. A clear, friendly photo of just you works best. Our team checks every new photo."}
      </p>

      {error && <p role="alert" className={errorClass}>{error}</p>}
      <label className={`${secondaryButtonClass} cursor-pointer self-start has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink`}>
        {progress !== null ? `Uploading... ${progress}%` : approvedUrl || pendingUrl ? "Upload a different photo" : "Upload profile photo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={progress !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
