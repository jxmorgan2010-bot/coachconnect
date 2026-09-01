"use client";

import { useState } from "react";
import Image from "next/image";
import type { IdVerificationStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";

const STATUS_META: Record<IdVerificationStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  APPROVED: { label: "Approved", variant: "success" },
  PENDING: { label: "Pending review", variant: "warning" },
  REJECTED: { label: "Rejected — please re-upload", variant: "danger" },
};

export default function VerificationUploads({
  hasIdPhoto,
  idPhotoPath,
  idStatus,
  profilePhotoUrl,
}: {
  hasIdPhoto: boolean;
  idPhotoPath: string | null;
  idStatus: IdVerificationStatus;
  profilePhotoUrl: string | null;
}) {
  const [idUploaded, setIdUploaded] = useState(hasIdPhoto);
  const [idPreviewPath, setIdPreviewPath] = useState(idPhotoPath);
  const [status, setStatus] = useState(idStatus);
  const [photoUrl, setPhotoUrl] = useState(profilePhotoUrl);
  const [idError, setIdError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [idLoading, setIdLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);

  async function uploadId(file: File) {
    setIdError(null);
    setIdLoading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/coach/upload-id", { method: "POST", body: form });
    const data = await res.json();
    setIdLoading(false);
    if (!res.ok) {
      setIdError(data.error ?? "Upload failed.");
      return;
    }
    setIdUploaded(true);
    setIdPreviewPath(data.filename ?? null);
    setStatus("PENDING");
  }

  async function uploadPhoto(file: File) {
    setPhotoError(null);
    setPhotoLoading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/coach/upload-photo", { method: "POST", body: form });
    const data = await res.json();
    setPhotoLoading(false);
    if (!res.ok) {
      setPhotoError(data.error ?? "Upload failed.");
      return;
    }
    setPhotoUrl(data.url);
  }

  const statusMeta = STATUS_META[status];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-secondary">School ID</h3>
          {idUploaded ? <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge> : <Badge>Not uploaded</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Used only to verify current enrollment. Never shown publicly — visible only to you and CoachConnect
          admins.
        </p>
        {idPreviewPath && (
          <div className="relative h-32 w-full overflow-hidden rounded-lg border border-border">
            <Image src={`/api/private-files/${idPreviewPath}`} alt="Your uploaded school ID" fill className="object-cover" />
          </div>
        )}
        {idError && <p className={errorClass}>{idError}</p>}
        <label className={`${secondaryButtonClass} cursor-pointer`}>
          {idLoading ? "Uploading..." : idUploaded ? "Re-upload ID" : "Upload school ID"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={idLoading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadId(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-secondary">Profile photo</h3>
          {photoUrl ? <Badge variant="success">Uploaded</Badge> : <Badge>Not uploaded</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">Shown publicly on your coach profile. A friendly, clear photo works best.</p>
        {photoUrl && (
          <div className="relative h-32 w-32 overflow-hidden rounded-full border border-border">
            <Image src={photoUrl} alt="Your profile photo" fill className="object-cover" />
          </div>
        )}
        {photoError && <p className={errorClass}>{photoError}</p>}
        <label className={`${secondaryButtonClass} cursor-pointer`}>
          {photoLoading ? "Uploading..." : photoUrl ? "Change photo" : "Upload profile photo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={photoLoading}
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
