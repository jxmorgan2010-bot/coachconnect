"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CoachProfile, CoachSport, Availability, Recommendation } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { IconCheck } from "@/components/icons";
import { isCoachLive, isCoachProfileComplete, getBackgroundCheckExpiryState } from "@/lib/coach";
import { areCoachOwnStepsDone, isIdStepDone } from "@/lib/onboardingSteps";
import { levelsFromFlags } from "@/lib/skillLevels";
import { BIO_VIDEO_UPLOADS_ENABLED } from "@/lib/features";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import ProfileForm, { type ProfileFormValues } from "./ProfileForm";
import AvailabilityForm, { type Slot } from "./AvailabilityForm";
import VerificationUploads from "./VerificationUploads";
import BackgroundCheckPanel from "./BackgroundCheckPanel";
import RecommendationPanel from "./RecommendationPanel";
import ConductAck from "./ConductAck";
import BioVideoUpload from "./BioVideoUpload";
import MinorGuardianConsentForm, { type MinorConsentSummary } from "./MinorGuardianConsentForm";
import MinorBackgroundNotice from "./MinorBackgroundNotice";

type FullProfile = CoachProfile & {
  sports: CoachSport[];
  availability: Availability[];
  recommendations: Recommendation[];
  user: { isSuspended: boolean };
};

/** Shown in place of the upload controls until a minor's parent/guardian has signed. */
function UploadsLockedNotice({ what }: { what: string }) {
  return (
    <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
      You can upload {what} once your parent or guardian signs the consent form (see{" "}
      <a href="#guardian-consent" className="font-bold text-pitch underline-offset-4 hover:underline">Parent/guardian consent</a>
      ). Their consent covers how we handle your school ID and photos.
    </p>
  );
}

/**
 * "coach": a step the coach finishes themselves; these make up their progress count.
 * "team": a step only an admin can mark; shown as waiting and never counted against the coach.
 */
type StepKind = "coach" | "team" | "optional";

const TEAM_WAITING_LABEL = "Waiting for our team";

function stepStatusText(kind: StepKind, done: boolean) {
  if (done) return " — done";
  if (kind === "team") return ` — ${TEAM_WAITING_LABEL.toLowerCase()}`;
  return kind === "optional" ? " — optional" : " — to do";
}

function Section({
  id,
  step,
  title,
  done,
  kind = "coach",
  children,
}: {
  id: string;
  step: number;
  title: string;
  done: boolean;
  kind?: StepKind;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="card scroll-mt-24 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3 border-b-2 border-line pb-4">
        <span
          aria-hidden
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm ${
            done ? "bg-pitch text-white" : kind === "team" ? "bg-surface text-ink" : "bg-gold text-ink"
          }`}
        >
          {done ? <IconCheck className="h-4 w-4" /> : step}
        </span>
        <h2 id={`${id}-title`} className="font-display text-2xl leading-none text-ink">
          {title}
          <span className="sr-only">{stepStatusText(kind, done)}</span>
        </h2>
        {kind === "optional" && !done && <Badge variant="neutral">Optional</Badge>}
        {done && <Badge variant="success">Done</Badge>}
      </div>
      {children}
    </section>
  );
}

/** Ends onboarding once the coach's own steps are done: their profile then waits for an admin. */
function FinishButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  return (
    <button
      type="button"
      className={`${primaryButtonClass} ${className}`}
      disabled={leaving}
      onClick={() => {
        setLeaving(true);
        router.push("/");
      }}
    >
      {leaving ? "Finishing..." : "Finish"}
    </button>
  );
}

export default function CoachOnboardingClient({
  profile,
  minorCoachesEnabled,
  minorConsent,
  coachEmail,
}: {
  profile: FullProfile;
  minorCoachesEnabled: boolean;
  /** Null unless this is a minor coach and the tier is on. */
  minorConsent: MinorConsentSummary | null;
  coachEmail: string;
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
    sportLevels: Object.fromEntries(profile.sports.map((s) => [s.sport, levelsFromFlags(s)])),
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

  // What each section has saved since the page loaded. Sections report their saves here, so the
  // checklist, counter and section badges update straight away instead of after a reload.
  const [savedSlotCount, setSavedSlotCount] = useState(initialSlots.length);
  const [conductAcknowledged, setConductAcknowledged] = useState(profile.conductAcknowledged);
  const [hasIdPhoto, setHasIdPhoto] = useState(Boolean(profile.idPhotoPath));
  const [idStatus, setIdStatus] = useState(profile.idVerificationStatus);
  const [photoUrl, setPhotoUrl] = useState(profile.profilePhotoUrl);

  // A re-uploaded ID goes back to pending review, which can take a live profile down.
  const live = isCoachLive({ ...profile, idVerificationStatus: idStatus });
  const expiryState = getBackgroundCheckExpiryState(profile);

  // Gathered once so the checklist and progress bar can't drift from the sections themselves.
  const consentDone = minorConsent?.status === "COMPLETED";
  const idDone = isIdStepDone({ hasIdPhoto, idStatus, hasProfilePhoto: Boolean(photoUrl) });
  // Admin-marked steps: shown as waiting for our team, never counted against the coach.
  const backgroundDone = expiryState === "VALID" || expiryState === "RENEWAL_NEEDED";
  // A minor can't upload their ID, photos or videos until a parent has consented (the server enforces this too).
  const mediaLocked = isMinorCoach && !consentDone;
  const minorBackgroundDone = Boolean(profile.minorBackgroundCheckNote);
  const videoDone = Boolean(profile.introClipUrl && profile.coachingClipUrl && profile.playingClipUrl);
  const recommendationDone = profile.recommendations.some((r) => r.status === "SUBMITTED");
  const ownStepsDone = areCoachOwnStepsDone({
    profileComplete,
    hasAvailability: savedSlotCount > 0,
    hasIdPhoto,
    idStatus,
    hasProfilePhoto: Boolean(photoUrl),
    conductAcknowledged,
    guardianConsentDone: isMinorCoach ? consentDone : null,
  });

  const steps: { id: string; title: string; done: boolean; kind: StepKind }[] = [
    { id: "profile", title: "Profile & sports", done: profileComplete, kind: "coach" },
    { id: "availability", title: "Availability", done: savedSlotCount > 0, kind: "coach" },
    // Minors: consent comes first, because it covers the ID and photo uploads that follow.
    ...(isMinorCoach
      ? [
          { id: "guardian-consent", title: "Parent/guardian consent", done: consentDone, kind: "coach" as const },
          { id: "identity", title: "ID & profile photo", done: idDone, kind: "coach" as const },
          { id: "minor-background", title: "Background verification", done: minorBackgroundDone, kind: "team" as const },
        ]
      : [
          { id: "identity", title: "ID & profile photo", done: idDone, kind: "coach" as const },
          { id: "background-check", title: "Background check", done: backgroundDone, kind: "team" as const },
        ]),
    // Bio video is hidden while uploads are paused (src/lib/features.ts).
    ...(BIO_VIDEO_UPLOADS_ENABLED ? [{ id: "bio-video", title: "Bio video", done: videoDone, kind: "optional" as const }] : []),
    { id: "recommendation", title: "Recommendation", done: recommendationDone, kind: "optional" },
    { id: "conduct", title: "Conduct rules", done: conductAcknowledged, kind: "coach" },
  ];
  const required = steps.filter((s) => s.kind === "coach");
  const requiredDone = required.filter((s) => s.done).length;
  const readyToFinish = ownStepsDone && !live;
  const stepNumber = (id: string) => steps.findIndex((s) => s.id === id) + 1;
  const stepFor = (id: string) => steps.find((s) => s.id === id)!;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <p className="eyebrow mb-2 text-pitch">Coach onboarding</p>
      <h1 className="text-display-lg font-display text-ink">Get your profile ready</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Finish your steps below, then submit your profile. It stays private until our team has approved your ID
        and marked the background check step.
      </p>

      {/* STATUS — the one thing a coach comes here to learn */}
      <div
        role="status"
        className={`mt-6 flex flex-col gap-3 rounded-xl border-2 border-ink p-4 sm:flex-row sm:items-center sm:gap-4 ${
          live ? "bg-success/10" : "bg-warning/10"
        }`}
      >
        {live ? (
          <>
            <Badge variant="success">Live</Badge>
            <span className="text-sm text-ink">Your profile is approved and visible to families.</span>
          </>
        ) : ownStepsDone ? (
          <>
            <Badge variant="warning">Ready to submit</Badge>
            <span className="text-sm text-ink">
              You&apos;ve finished your steps. Select Finish to submit your profile. An admin will review it before
              families can find you.
            </span>
          </>
        ) : (
          <>
            <Badge variant="warning">Not live yet</Badge>
            <span className="text-sm text-ink">
              Families can&apos;t find you yet. Finish the required steps and our team will review your profile.
            </span>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {profile.isSuspended && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-danger/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="danger">Paused</Badge>
            <span className="text-sm text-ink">
              Your profile is temporarily hidden after receiving multiple reports. An admin will review and follow
              up.
            </span>
          </div>
        )}

        {isMinorCoach && !profile.isSuspended && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-accent/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="accent">Minor Coach</Badge>
            <span className="text-sm text-ink">
              {minorConsent?.status === "REVOKED"
                ? "Your parent or guardian withdrew their consent, so your profile is hidden from families."
                : "You're in the under-18 coach flow. Start with parent/guardian consent: until it's signed you can't upload your ID or photos, and our team can't review your profile."}
            </span>
          </div>
        )}

        {!isMinorCoach && expiryState === "RENEWAL_NEEDED" && !profile.isSuspended && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-warning/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="warning">Renewal needed</Badge>
            <span className="text-sm text-ink">
              Your yearly background check step is due{" "}
              {profile.backgroundCheckExpiresAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
              Our team marks it again when it&apos;s reviewed.
            </span>
          </div>
        )}

        {!isMinorCoach && expiryState === "EXPIRED" && !profile.isSuspended && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-danger/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="danger">Lapsed</Badge>
            <span className="text-sm text-ink">
              Your yearly background check step lapsed, so your profile is unpublished. It goes live again once our
              team marks this step.
            </span>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        {/* PROGRESS — bar on phones, sticky checklist on desktop */}
        <nav aria-label="Onboarding steps" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm font-bold text-ink" aria-live="polite">
            {requiredDone} of {required.length} steps done
          </p>
          <div className="flex gap-1 lg:hidden" aria-hidden>
            {required.map((s) => (
              <span key={s.id} className={`h-2 flex-1 rounded-full border border-ink ${s.done ? "bg-pitch" : "bg-surface"}`} />
            ))}
          </div>
          <ol className="hidden flex-col border-l-2 border-line lg:flex">
            {steps.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-0.5 flex min-h-11 items-center gap-2.5 border-l-2 border-transparent py-1 pl-3 text-sm hover:border-gold"
                >
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold ${
                      s.done
                        ? "border-ink bg-pitch text-white"
                        : s.kind === "team"
                          ? "border-dashed border-ink bg-surface text-muted-foreground"
                          : "border-ink bg-surface text-ink"
                    }`}
                  >
                    {s.done ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={s.done || s.kind === "team" ? "text-muted-foreground" : "font-bold text-ink"}>
                    {s.title}
                    {s.kind === "optional" && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                    {s.kind === "team" && !s.done ? (
                      <span className="block text-xs">{TEAM_WAITING_LABEL}</span>
                    ) : (
                      <span className="sr-only">{stepStatusText(s.kind, s.done)}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
          {readyToFinish && <FinishButton className="mt-4 w-full" />}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Section id="profile" step={stepNumber("profile")} title="Profile & sports" done={stepFor("profile").done}>
            <ProfileForm initial={profileValues} onSaved={setProfileValues} />
          </Section>

          <Section id="availability" step={stepNumber("availability")} title="Availability" done={stepFor("availability").done}>
            <AvailabilityForm initial={initialSlots} onSaved={(slots) => setSavedSlotCount(slots.length)} />
          </Section>

          {isMinorCoach && minorConsent && (
            <Section id="guardian-consent" step={stepNumber("guardian-consent")} title="Parent/guardian consent" done={consentDone}>
              <MinorGuardianConsentForm initial={minorConsent} coachEmail={coachEmail} />
            </Section>
          )}

          <Section id="identity" step={stepNumber("identity")} title="ID & profile photo" done={idDone}>
            {mediaLocked ? (
              <UploadsLockedNotice what="your school ID and profile photo" />
            ) : (
              <VerificationUploads
                hasIdPhoto={Boolean(profile.idPhotoPath)}
                idStatus={profile.idVerificationStatus}
                profilePhotoUrl={profile.profilePhotoUrl}
                onIdUploaded={() => {
                  setHasIdPhoto(true);
                  setIdStatus("PENDING");
                }}
                onPhotoUploaded={setPhotoUrl}
              />
            )}
          </Section>

          {!isMinorCoach && (
            <Section id="background-check" step={stepNumber("background-check")} title="Background check" done={backgroundDone} kind="team">
              <BackgroundCheckPanel
                status={profile.backgroundCheckStatus}
                expiresAt={profile.backgroundCheckExpiresAt}
                checkRef={profile.backgroundCheckRef}
              />
            </Section>
          )}

          {isMinorCoach && (
            <Section id="minor-background" step={stepNumber("minor-background")} title="Background verification" done={minorBackgroundDone} kind="team">
              <MinorBackgroundNotice verified={minorBackgroundDone} />
            </Section>
          )}

          {BIO_VIDEO_UPLOADS_ENABLED && (
            <Section id="bio-video" step={stepNumber("bio-video")} title="Bio video" kind="optional" done={videoDone}>
              {mediaLocked ? (
                <UploadsLockedNotice what="bio videos" />
              ) : (
                <BioVideoUpload
                  initial={{
                    intro: { url: profile.introClipUrl, seconds: profile.introClipSeconds },
                    coaching: { url: profile.coachingClipUrl, seconds: profile.coachingClipSeconds },
                    playing: { url: profile.playingClipUrl, seconds: profile.playingClipSeconds },
                  }}
                />
              )}
            </Section>
          )}

          <Section id="recommendation" step={stepNumber("recommendation")} title="Recommendation" kind="optional" done={recommendationDone}>
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

          <Section id="conduct" step={stepNumber("conduct")} title="Platform conduct rules" done={conductAcknowledged}>
            <ConductAck initialAcknowledged={profile.conductAcknowledged} onAcknowledged={() => setConductAcknowledged(true)} />
          </Section>

          {/* FINISH — the end of onboarding: what's left is the admin's part */}
          <section aria-labelledby="finish-title" className="card scroll-mt-24 p-5 sm:p-6" id="finish">
            <h2 id="finish-title" className="font-display text-2xl leading-none text-ink">
              {live ? "You're live" : readyToFinish ? "Submit your profile" : "Finish up"}
            </h2>
            <p className="mt-3 text-sm text-ink/85">
              {live
                ? "Families can find you in search. Come back here any time to update your profile."
                : readyToFinish
                  ? "Your steps are done. Select Finish and an admin will review your profile before families can find you."
                  : `Finish your ${required.length - requiredDone === 1 ? "last step" : `${required.length - requiredDone} remaining steps`} above, then you can submit your profile for review.`}
            </p>
            <div className="mt-4">
              {live ? (
                <Link href="/dashboard" className={`${secondaryButtonClass} w-full sm:w-auto`}>Go to your dashboard</Link>
              ) : readyToFinish ? (
                <FinishButton className="w-full sm:w-auto" />
              ) : (
                <button type="button" className={`${primaryButtonClass} w-full sm:w-auto`} disabled>
                  Finish
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
