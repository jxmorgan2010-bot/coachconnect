"use client";

import { useState } from "react";
import Image from "next/image";
import type { IdVerificationStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";
import { uploadCoachFile } from "@/lib/coachUpload";

const STATUS_META: Record<IdVerificationStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  APPROVED: { label: "Approved", variant: "success" },
  PENDING: { label: "Pending review", variant: "warning" },
  REJECTED: { label: "Rejected — please re-upload", variant: "danger" },
};

export default function VerificationUploads({
  hasIdPhoto,
  idStatus,
  profilePhotoUrl,
  onIdUploaded,
  onPhotoUploaded,
}: {
  hasIdPhoto: boolean;
  idStatus: IdVerificationStatus;
  profilePhotoUrl: string | null;
  /** A new ID is saved and back to pending review. */
  onIdUploaded: () => void;
  onPhotoUploaded: (url: string) => void;
}) {
  const [idUploaded, setIdUploaded] = useState(hasIdPhoto);
  // Bumped after each re-upload so the preview refetches (its URL is otherwise unchanged).
  const [idVersion, setIdVersion] = useState(0);
  const [status, setStatus] = useState(idStatus);
  const [photoUrl, setPhotoUrl] = useState(profilePhotoUrl);
  const [idError, setIdError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [idProgress, setIdProgress] = useState<number | null>(null);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);

  async function uploadId(file: File) {
    setIdError(null);
    setIdProgress(0);
    const result = await uploadCoachFile("id", file, { onProgress: setIdProgress });
    setIdProgress(null);
    if (!result.ok) {
      setIdError(result.error);
      return;
    }
    setIdUploaded(true);
    setIdVersion((v) => v + 1);
    setStatus("PENDING");
    onIdUploaded();
  }

  async function uploadPhoto(file: File) {
    setPhotoError(null);
    setPhotoProgress(0);
    const result = await uploadCoachFile("photo", file, { onProgress: setPhotoProgress });
    setPhotoProgress(null);
    if (!result.ok) {
      setPhotoError(result.error);
      return;
    }
    if (result.url) {
      setPhotoUrl(result.url);
      onPhotoUploaded(result.url);
    }
  }

  const statusMeta = STATUS_META[status];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-xl border-2 border-line bg-chalk p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg leading-none text-ink">School ID</h3>
          {idUploaded ? <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge> : <Badge>Not uploaded</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Used only to verify current enrollment. Never shown publicly — visible only to you and CoachConnect
          admins.
        </p>
        {idUploaded && (
          <div className="relative h-32 w-full overflow-hidden rounded-lg border-2 border-ink">
            {/* unoptimized: the browser fetches it with the coach's session, so the ID never enters Next's image cache. */}
            <Image src={`/api/coach/id-photo?v=${idVersion}`} alt="Your uploaded school ID" fill unoptimized className="object-cover" />
          </div>
        )}
        {idError && <p className={errorClass}>{idError}</p>}
        <label className={`${secondaryButtonClass} cursor-pointer has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink`}>
          {idProgress !== null ? `Uploading... ${idProgress}%` : idUploaded ? "Re-upload ID" : "Upload school ID"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={idProgress !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadId(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border-2 border-line bg-chalk p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg leading-none text-ink">Profile photo</h3>
          {photoUrl ? <Badge variant="success">Uploaded</Badge> : <Badge>Not uploaded</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">Shown publicly on your coach profile. A friendly, clear photo works best.</p>
        {photoUrl && (
          <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-ink">
            <Image src={photoUrl} alt="Your profile photo" fill className="object-cover" />
          </div>
        )}
        {photoError && <p className={errorClass}>{photoError}</p>}
        <label className={`${secondaryButtonClass} cursor-pointer has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink`}>
          {photoProgress !== null ? `Uploading... ${photoProgress}%` : photoUrl ? "Change photo" : "Upload profile photo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={photoProgress !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
