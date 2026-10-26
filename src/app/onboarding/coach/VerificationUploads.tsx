"use client";

import { useState } from "react";
import Image from "next/image";
import type { CoachType, IdDocumentType, IdVerificationStatus } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";
import { secondaryButtonClass, errorClass, inputClass, labelClass } from "@/lib/ui";
import { uploadCoachFile } from "@/lib/coachUpload";
import { GOVERNMENT_ID_TYPES, ID_DOCUMENT_LABELS, isGovernmentIdType, type GovernmentIdType } from "@/lib/coachTypes";

const STATUS_META: Record<IdVerificationStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  APPROVED: { label: "Approved", variant: "success" },
  PENDING: { label: "Pending review", variant: "warning" },
  REJECTED: { label: "Rejected — please re-upload", variant: "danger" },
};

export default function VerificationUploads({
  coachType,
  idDocumentType,
  hasIdPhoto,
  idStatus,
  profilePhotoUrl,
  pendingPhotoUrl,
  photoRejected,
  onIdUploaded,
  onPhotoUploaded,
}: {
  /** Student-athletes upload a school ID; experienced coaches a government photo ID and say which. */
  coachType: CoachType;
  idDocumentType: IdDocumentType | null;
  hasIdPhoto: boolean;
  idStatus: IdVerificationStatus;
  /** The approved photo families see. */
  profilePhotoUrl: string | null;
  /** A newer upload waiting for admin approval. */
  pendingPhotoUrl: string | null;
  photoRejected: boolean;
  /** A new ID is saved and back to pending review. */
  onIdUploaded: () => void;
  /** A new photo is saved and waiting for approval. */
  onPhotoUploaded: (pendingUrl: string) => void;
}) {
  const [idUploaded, setIdUploaded] = useState(hasIdPhoto);
  // Bumped after each re-upload so the preview refetches (its URL is otherwise unchanged).
  const [idVersion, setIdVersion] = useState(0);
  const [status, setStatus] = useState(idStatus);
  const [idError, setIdError] = useState<string | null>(null);
  const [idProgress, setIdProgress] = useState<number | null>(null);
  const governmentId = coachType === "EXPERIENCED";
  const [documentType, setDocumentType] = useState<GovernmentIdType | "">(
    isGovernmentIdType(idDocumentType) ? idDocumentType : "",
  );
  // Which ID the saved photo is, so the label doesn't change just because the picker did.
  const [savedDocumentType, setSavedDocumentType] = useState(idDocumentType);

  async function uploadId(file: File) {
    setIdError(null);
    if (governmentId && !documentType) {
      setIdError("Choose which ID this is first.");
      return;
    }
    setIdProgress(0);
    const result = await uploadCoachFile("id", file, {
      onProgress: setIdProgress,
      documentType: governmentId && documentType ? documentType : undefined,
    });
    setIdProgress(null);
    if (!result.ok) {
      setIdError(result.error);
      return;
    }
    setIdUploaded(true);
    if (governmentId && documentType) setSavedDocumentType(documentType);
    setIdVersion((v) => v + 1);
    setStatus("PENDING");
    onIdUploaded();
  }

  const statusMeta = STATUS_META[status];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-xl border-2 border-line bg-chalk p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg leading-none text-ink">{governmentId ? "Photo ID" : "School ID"}</h3>
          {idUploaded ? <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge> : <Badge>Not uploaded</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {governmentId
            ? "A driver's license, state ID or passport. Used only to confirm who you are and your age."
            : "Used only to verify current enrollment."}{" "}
          Never shown publicly — visible only to you and CoachConnect admins.
        </p>
        {governmentId && (
          <div>
            <label className={labelClass} htmlFor="idDocumentType">Which ID is this?</label>
            <select
              id="idDocumentType"
              className={inputClass}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as GovernmentIdType)}
            >
              <option value="" disabled>Select...</option>
              {GOVERNMENT_ID_TYPES.map((type) => (
                <option key={type} value={type}>{ID_DOCUMENT_LABELS[type]}</option>
              ))}
            </select>
          </div>
        )}
        {idUploaded && (
          <div className="relative h-32 w-full overflow-hidden rounded-lg border-2 border-ink">
            {/* unoptimized: the browser fetches it with the coach's session, so the ID never enters Next's image cache. */}
            <Image
              src={`/api/coach/id-photo?v=${idVersion}`}
              alt={governmentId && savedDocumentType ? `Your uploaded ${ID_DOCUMENT_LABELS[savedDocumentType].toLowerCase()}` : governmentId ? "Your uploaded photo ID" : "Your uploaded school ID"}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        )}
        {idError && <p className={errorClass}>{idError}</p>}
        <label
          className={`${secondaryButtonClass} cursor-pointer has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`}
        >
          {idProgress !== null ? `Uploading... ${idProgress}%` : idUploaded ? "Re-upload ID" : governmentId ? "Upload photo ID" : "Upload school ID"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={idProgress !== null || (governmentId && !documentType)}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadId(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border-2 border-line bg-chalk p-4">
        <h3 className="font-display text-lg leading-none text-ink">Profile photo</h3>
        <ProfilePhotoUploader
          approvedUrl={profilePhotoUrl}
          pendingUrl={pendingPhotoUrl}
          rejected={photoRejected}
          onUploaded={onPhotoUploaded}
        />
      </div>
    </div>
  );
}
