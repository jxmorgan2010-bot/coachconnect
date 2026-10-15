import Link from "next/link";
import type { CoachProfile } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import type { BackgroundCheckExpiryState } from "@/lib/coach";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { quietLinkClass } from "@/lib/ui";

type Variant = "success" | "warning" | "danger" | "neutral";
export type VerificationItem = { label: string; status: string; variant: Variant };

/** Where each verification step stands, from the profile as stored. Admin-marked steps say so. */
export function getVerificationItems(
  p: Pick<
    CoachProfile,
    | "idPhotoPath"
    | "idVerificationStatus"
    | "backgroundCheckExpiresAt"
    | "isMinorCoach"
    | "minorBackgroundCheckNote"
    | "profilePhotoUrl"
    | "pendingProfilePhotoUrl"
    | "profilePhotoRejectedAt"
    | "conductAcknowledged"
  >,
  expiryState: BackgroundCheckExpiryState,
): VerificationItem[] {
  // The admin's decision comes first: an approved ID stays approved even if the file record is missing.
  const id: VerificationItem =
    p.idVerificationStatus === "APPROVED"
      ? { label: "School ID", status: "Approved", variant: "success" }
      : p.idVerificationStatus === "REJECTED"
        ? { label: "School ID", status: "Upload a new one", variant: "danger" }
        : !p.idPhotoPath
          ? { label: "School ID", status: "Not uploaded", variant: "danger" }
          : { label: "School ID", status: "Waiting for our team", variant: "warning" };

  const background: VerificationItem =
    ENABLE_MINOR_COACHES && p.isMinorCoach
      ? p.minorBackgroundCheckNote
        ? { label: "Background verification", status: "Recorded by our team", variant: "success" }
        : { label: "Background verification", status: "Waiting for our team", variant: "neutral" }
      : expiryState === "VALID"
        ? { label: "Background check step", status: "Marked by our team", variant: "success" }
        : expiryState === "RENEWAL_NEEDED"
          ? {
              label: "Background check step",
              status: `Due ${p.backgroundCheckExpiresAt?.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) ?? "soon"}`,
              variant: "warning",
            }
          : expiryState === "EXPIRED"
            ? { label: "Background check step", status: "Lapsed", variant: "danger" }
            : { label: "Background check step", status: "Waiting for our team", variant: "neutral" };

  const photo: VerificationItem = p.pendingProfilePhotoUrl
    ? { label: "Profile photo", status: "New photo waiting for approval", variant: "warning" }
    : p.profilePhotoRejectedAt
      ? { label: "Profile photo", status: "Not approved, upload another", variant: "danger" }
      : p.profilePhotoUrl
        ? { label: "Profile photo", status: "Approved", variant: "success" }
        : { label: "Profile photo", status: "Not uploaded", variant: "danger" };

  const conduct: VerificationItem = p.conductAcknowledged
    ? { label: "Conduct rules", status: "Agreed", variant: "success" }
    : { label: "Conduct rules", status: "To do", variant: "danger" };

  return [id, background, photo, conduct];
}

/** The coach's verification at a glance, linking to the full verification page. */
export default function VerificationCard({ items }: { items: VerificationItem[] }) {
  return (
    <section aria-labelledby="verification-title" className="rounded-xl border-2 border-ink bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="verification-title" className="font-display text-2xl leading-none text-ink">Verification</h2>
        <Link href="/onboarding/coach" className={`${quietLinkClass} text-pitch`}>
          Open verification
        </Link>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-start gap-1">
            <dt className="eyebrow text-muted-foreground">{item.label}</dt>
            <dd>
              <Badge variant={item.variant}>{item.status}</Badge>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
