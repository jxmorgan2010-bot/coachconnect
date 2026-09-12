"use client";

import { useState } from "react";
import type { CoachProfile, CoachSport, Availability, Recommendation } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { isCoachLive, isCoachProfileComplete, getBackgroundCheckExpiryState } from "@/lib/coach";
import ProfileForm, { type ProfileFormValues } from "./ProfileForm";
import AvailabilityForm, { type Slot } from "./AvailabilityForm";
import VerificationUploads from "./VerificationUploads";
import BackgroundCheckPanel from "./BackgroundCheckPanel";
import RecommendationPanel from "./RecommendationPanel";
import ConductAck from "./ConductAck";
import BioVideoUpload from "./BioVideoUpload";
import MinorGuardianConsentForm from "./MinorGuardianConsentForm";
import MinorBackgroundNotice from "./MinorBackgroundNotice";

type FullProfile = CoachProfile & {
  sports: CoachSport[];
  availability: Availability[];
  recommendations: Recommendation[];
};

function Section({ step, title, done, children }: { step: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
            done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? "✓" : step}
        </span>
        <h2 className="text-lg font-bold text-secondary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function CoachOnboardingClient({
  profile,
  minorCoachesEnabled,
}: {
  profile: FullProfile;
  minorCoachesEnabled: boolean;
}) {
  const isMinorCoach = minorCoachesEnabled && profile.isMinorCoach;
  const [profileValues, setProfileValues] = useState<ProfileFormValues>({
    bio: profile.bio ?? "",
    schoolLevel: profile.schoolLevel ?? "",
    schoolName: profile.schoolName ?? "",
    gradYear: profile.gradYear ? String(profile.gradYear) : "",
    hourlyRateDollars: profile.hourlyRateCents ? String(profile.hourlyRateCents / 100) : "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    zip: profile.zip ?? "",
    sports: profile.sports.map((s) => s.sport),
  });

  const profileComplete = isCoachProfileComplete({
    bio: profileValues.bio || null,
    schoolLevel: (profileValues.schoolLevel || null) as CoachProfile["schoolLevel"],
    schoolName: profileValues.schoolName || null,
    gradYear: profileValues.gradYear ? Number(profileValues.gradYear) : null,
    hourlyRateCents: profileValues.hourlyRateDollars ? Number(profileValues.hourlyRateDollars) * 100 : null,
    city: profileValues.city || null,
    state: profileValues.state || null,
  }) && profileValues.sports.length > 0;

  const initialSlots: Slot[] = profile.availability.map((a) => ({
    dayOfWeek: a.dayOfWeek,
    startMinute: a.startMinute,
    endMinute: a.endMinute,
  }));

  const live = isCoachLive(profile);
  const expiryState = getBackgroundCheckExpiryState(profile);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-2xl font-extrabold text-secondary sm:text-3xl">Coach onboarding</h1>
      <p className="mb-6 text-muted-foreground">
        Complete every step below. Your profile stays private until an admin approves both your ID verification
        and your background check.
      </p>

      {profile.isSuspended && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border-2 border-ink bg-danger/10 p-4">
          <Badge variant="danger">Paused</Badge>
          <span className="text-sm text-secondary">
            Your profile is temporarily hidden after receiving multiple reports. An admin will review and follow
            up.
          </span>
        </div>
      )}

      {isMinorCoach && !profile.isSuspended && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border-2 border-ink bg-accent/10 p-4">
          <Badge variant="accent">Minor Coach</Badge>
          <span className="text-sm text-secondary">
            You&apos;re in the under-18 coach flow: your parent/guardian must sign a consent form, and our team
            manually confirms background verification before your profile can go live.
          </span>
        </div>
      )}

      {!isMinorCoach && expiryState === "RENEWAL_NEEDED" && !profile.isSuspended && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border-2 border-ink bg-warning/10 p-4">
          <Badge variant="warning">Renewal needed</Badge>
          <span className="text-sm text-secondary">
            Your background check expires{" "}
            {profile.backgroundCheckExpiresAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
            Run a new check below before it lapses to stay visible.
          </span>
        </div>
      )}

      {!isMinorCoach && expiryState === "EXPIRED" && !profile.isSuspended && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border-2 border-ink bg-danger/10 p-4">
          <Badge variant="danger">Expired</Badge>
          <span className="text-sm text-secondary">
            Your background check expired and your profile is unpublished. Run a new check below to go live
            again.
          </span>
        </div>
      )}

      <div className={`mb-8 flex items-center gap-3 rounded-xl border p-4 ${live ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
        {live ? (
          <>
            <Badge variant="success">Live</Badge>
            <span className="text-sm text-secondary">Your profile is approved and visible to families.</span>
          </>
        ) : (
          <>
            <Badge variant="warning">Pending approval</Badge>
            <span className="text-sm text-secondary">
              Your profile isn&apos;t searchable yet. Finish the steps below and an admin will review your ID and
              background check.
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <Section step={1} title="Profile & sports" done={profileComplete}>
          <ProfileForm initial={profileValues} onSaved={setProfileValues} />
        </Section>

        <Section step={2} title="Availability" done={initialSlots.length > 0}>
          <AvailabilityForm initial={initialSlots} />
        </Section>

        <Section step={3} title="Identity & photo verification" done={profile.idVerificationStatus === "APPROVED" && Boolean(profile.profilePhotoUrl)}>
          <VerificationUploads
            hasIdPhoto={Boolean(profile.idPhotoPath)}
            idPhotoPath={profile.idPhotoPath}
            idStatus={profile.idVerificationStatus}
            profilePhotoUrl={profile.profilePhotoUrl}
          />
        </Section>

        {isMinorCoach ? (
          <Section step={4} title="Parent/guardian consent" done={Boolean(profile.minorGuardianConsentedAt)}>
            <MinorGuardianConsentForm
              initial={{
                token: profile.minorConsentToken,
                guardianName: profile.minorGuardianName,
                guardianRelationship: profile.minorGuardianRelationship,
                consentedAt: profile.minorGuardianConsentedAt ? profile.minorGuardianConsentedAt.toISOString() : null,
              }}
            />
          </Section>
        ) : (
          <Section step={4} title="Background check" done={expiryState === "VALID" || expiryState === "RENEWAL_NEEDED"}>
            <BackgroundCheckPanel
              initialStatus={profile.backgroundCheckStatus}
              expiresAt={profile.backgroundCheckExpiresAt}
            />
          </Section>
        )}

        {isMinorCoach && (
          <Section step={5} title="Background verification" done={Boolean(profile.minorBackgroundCheckNote)}>
            <MinorBackgroundNotice verified={Boolean(profile.minorBackgroundCheckNote)} />
          </Section>
        )}

        <Section step={isMinorCoach ? 6 : 5} title="Bio video (optional)" done={Boolean(profile.introClipUrl && profile.coachingClipUrl && profile.playingClipUrl)}>
          <BioVideoUpload
            initial={{
              intro: { url: profile.introClipUrl, seconds: profile.introClipSeconds },
              coaching: { url: profile.coachingClipUrl, seconds: profile.coachingClipSeconds },
              playing: { url: profile.playingClipUrl, seconds: profile.playingClipSeconds },
            }}
          />
        </Section>

        <Section step={isMinorCoach ? 7 : 6} title="Recommendation (optional)" done={profile.recommendations.some((r) => r.status === "SUBMITTED")}>
          <RecommendationPanel
            initial={profile.recommendations.map((r) => ({
              id: r.id,
              token: r.token,
              status: r.status,
              recommenderName: r.recommenderName,
              content: r.content,
            }))}
          />
        </Section>

        <Section step={isMinorCoach ? 8 : 7} title="Platform conduct rules" done={profile.conductAcknowledged}>
          <ConductAck initialAcknowledged={profile.conductAcknowledged} />
        </Section>
      </div>
    </div>
  );
}
