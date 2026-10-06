"use client";

import { useState } from "react";
import type { CoachProfile, CoachSport, Availability, Recommendation } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import { IconCheck } from "@/components/icons";
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

function Section({
  id,
  step,
  title,
  done,
  optional = false,
  children,
}: {
  id: string;
  step: number;
  title: string;
  done: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="card scroll-mt-24 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3 border-b-2 border-line pb-4">
        <span
          aria-hidden
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm ${
            done ? "bg-pitch text-white" : "bg-gold text-ink"
          }`}
        >
          {done ? <IconCheck className="h-4 w-4" /> : step}
        </span>
        <h2 id={`${id}-title`} className="font-display text-2xl leading-none text-ink">
          {title}
          <span className="sr-only">{done ? " — done" : optional ? " — optional" : " — to do"}</span>
        </h2>
        {optional && !done && <Badge variant="neutral">Optional</Badge>}
        {done && <Badge variant="success">Done</Badge>}
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

  // Same "done" conditions each section used before — gathered once so the
  // checklist and progress bar can't drift from the sections themselves.
  const idDone = profile.idVerificationStatus === "APPROVED" && Boolean(profile.profilePhotoUrl);
  const backgroundDone = expiryState === "VALID" || expiryState === "RENEWAL_NEEDED";
  const consentDone = Boolean(profile.minorGuardianConsentedAt);
  const minorBackgroundDone = Boolean(profile.minorBackgroundCheckNote);
  const videoDone = Boolean(profile.introClipUrl && profile.coachingClipUrl && profile.playingClipUrl);
  const recommendationDone = profile.recommendations.some((r) => r.status === "SUBMITTED");

  const steps: { id: string; title: string; done: boolean; optional?: boolean }[] = [
    { id: "profile", title: "Profile & sports", done: profileComplete },
    { id: "availability", title: "Availability", done: initialSlots.length > 0 },
    { id: "identity", title: "ID & profile photo", done: idDone },
    ...(isMinorCoach
      ? [
          { id: "guardian-consent", title: "Parent/guardian consent", done: consentDone },
          { id: "minor-background", title: "Background verification", done: minorBackgroundDone },
        ]
      : [{ id: "background-check", title: "Background check", done: backgroundDone }]),
    { id: "bio-video", title: "Bio video", done: videoDone, optional: true },
    { id: "recommendation", title: "Recommendation", done: recommendationDone, optional: true },
    { id: "conduct", title: "Conduct rules", done: profile.conductAcknowledged },
  ];
  const required = steps.filter((s) => !s.optional);
  const requiredDone = required.filter((s) => s.done).length;
  const stepNumber = (id: string) => steps.findIndex((s) => s.id === id) + 1;
  const stepFor = (id: string) => steps.find((s) => s.id === id)!;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <p className="eyebrow mb-2 text-pitch">Coach onboarding</p>
      <h1 className="text-display-lg font-display text-ink">Get your profile ready</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Finish the required steps below. Your profile stays private until our team has reviewed your ID and
        you&apos;ve completed the background check step.
      </p>

      {/* STATUS — the one thing a coach comes here to learn */}
      <div
        className={`mt-6 flex flex-col gap-3 rounded-xl border-2 border-ink p-4 sm:flex-row sm:items-center sm:gap-4 ${
          live ? "bg-success/10" : "bg-warning/10"
        }`}
      >
        {live ? (
          <>
            <Badge variant="success">Live</Badge>
            <span className="text-sm text-ink">Your profile is approved and visible to families.</span>
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
              You&apos;re in the under-18 coach flow: your parent/guardian must sign a consent form, and our team
              manually confirms background verification before your profile can go live.
            </span>
          </div>
        )}

        {!isMinorCoach && expiryState === "RENEWAL_NEEDED" && !profile.isSuspended && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-warning/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="warning">Renewal needed</Badge>
            <span className="text-sm text-ink">
              Your yearly background check step is due{" "}
              {profile.backgroundCheckExpiresAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
              Renew it below before then to stay visible.
            </span>
          </div>
        )}

        {!isMinorCoach && expiryState === "EXPIRED" && !profile.isSuspended && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-danger/10 p-4 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="danger">Lapsed</Badge>
            <span className="text-sm text-ink">
              Your yearly background check step lapsed, so your profile is unpublished. Renew it below to go live
              again.
            </span>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        {/* PROGRESS — bar on phones, sticky checklist on desktop */}
        <nav aria-label="Onboarding steps" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm font-bold text-ink">
            {requiredDone} of {required.length} required steps done
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
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-ink text-xs font-bold ${
                      s.done ? "bg-pitch text-white" : "bg-surface text-ink"
                    }`}
                  >
                    {s.done ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={s.done ? "text-muted-foreground" : "font-bold text-ink"}>
                    {s.title}
                    {s.optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                    <span className="sr-only">{s.done ? " — done" : " — to do"}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Section id="profile" step={stepNumber("profile")} title="Profile & sports" done={stepFor("profile").done}>
            <ProfileForm initial={profileValues} onSaved={setProfileValues} />
          </Section>

          <Section id="availability" step={stepNumber("availability")} title="Availability" done={stepFor("availability").done}>
            <AvailabilityForm initial={initialSlots} />
          </Section>

          <Section id="identity" step={stepNumber("identity")} title="ID & profile photo" done={idDone}>
            <VerificationUploads
              hasIdPhoto={Boolean(profile.idPhotoPath)}
              idPhotoPath={profile.idPhotoPath}
              idStatus={profile.idVerificationStatus}
              profilePhotoUrl={profile.profilePhotoUrl}
            />
          </Section>

          {isMinorCoach ? (
            <Section id="guardian-consent" step={stepNumber("guardian-consent")} title="Parent/guardian consent" done={consentDone}>
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
            <Section id="background-check" step={stepNumber("background-check")} title="Background check" done={backgroundDone}>
              <BackgroundCheckPanel
                initialStatus={profile.backgroundCheckStatus}
                expiresAt={profile.backgroundCheckExpiresAt}
              />
            </Section>
          )}

          {isMinorCoach && (
            <Section id="minor-background" step={stepNumber("minor-background")} title="Background verification" done={minorBackgroundDone}>
              <MinorBackgroundNotice verified={minorBackgroundDone} />
            </Section>
          )}

          <Section id="bio-video" step={stepNumber("bio-video")} title="Bio video" optional done={videoDone}>
            <BioVideoUpload
              initial={{
                intro: { url: profile.introClipUrl, seconds: profile.introClipSeconds },
                coaching: { url: profile.coachingClipUrl, seconds: profile.coachingClipSeconds },
                playing: { url: profile.playingClipUrl, seconds: profile.playingClipSeconds },
              }}
            />
          </Section>

          <Section id="recommendation" step={stepNumber("recommendation")} title="Recommendation" optional done={recommendationDone}>
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

          <Section id="conduct" step={stepNumber("conduct")} title="Platform conduct rules" done={profile.conductAcknowledged}>
            <ConductAck initialAcknowledged={profile.conductAcknowledged} />
          </Section>
        </div>
      </div>
    </div>
  );
}
