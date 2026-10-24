import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { formatCents } from "@/lib/money";
import Badge from "@/components/Badge";
import SportPill from "@/components/SportPill";
import LevelTags from "@/components/LevelTags";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";
import CoachProfileHeader, { schoolLine } from "@/components/coach-profile/CoachProfileHeader";
import AvailabilityList from "@/components/coach-profile/AvailabilityList";
import AccommodationsList from "@/components/coach-profile/AccommodationsList";
import RecommendationsList from "@/components/coach-profile/RecommendationsList";
import ReviewsSection from "@/components/coach-profile/ReviewsSection";
import VideoClips, { videoClips } from "@/components/coach-profile/VideoClips";
import RemoveClipButton from "./RemoveClipButton";
import BioVideoUpload from "@/app/onboarding/coach/BioVideoUpload";
import type { ProfileFormField, ProfileFormValues } from "@/app/onboarding/coach/ProfileForm";
import EditableSection, { AvailabilityEditor, BasicsEditor, ProfileFieldsEditor } from "./EditableSection";
import AccommodationsForm from "./AccommodationsForm";
import BookingHistory from "./BookingHistory";
import { getBackgroundCheckExpiryState, hasVerifiedVideoBio, isCoachLive } from "@/lib/coach";
import { coachProfileSchema } from "@/lib/validation";
import { accommodationsFromProfile, hasAnyAccommodations } from "@/lib/accommodations";
import { reviewerName } from "@/lib/reviews";
import { BOOKING_HISTORY_PAGE_SIZE, parsePage, pastWhere, upcomingWhere } from "@/lib/bookingHistory";
import { getCoachSessionsCompleted } from "@/lib/stats";
import { isTopCoach } from "@/lib/points";
import { levelsFromFlags } from "@/lib/skillLevels";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { BIO_VIDEO_UPLOADS_ENABLED } from "@/lib/features";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";

const historySelect = {
  id: true,
  scheduledAt: true,
  sport: true,
  status: true,
  cancelledBy: true,
  lateCancellation: true,
  childLevel: true,
  child: { select: { firstName: true } },
} as const;

export default async function MyCoachProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/profile");
  if (session.user.role === "ADMIN") redirect("/admin");
  // Parents don't have a public profile; their kids and account live on the Family page.
  if (session.user.role !== "COACH") redirect("/dashboard/family");

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { name: true, isSuspended: true } },
      sports: true,
      availability: true,
      recommendations: { where: { status: "SUBMITTED" }, orderBy: { submittedAt: "desc" } },
      reviews: { include: { parentProfile: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!profile) redirect("/dashboard");

  const page = parsePage((await searchParams).page);
  const now = new Date();
  const [sessionsCompleted, upcoming, past, pastTotal] = await Promise.all([
    getCoachSessionsCompleted(profile.id),
    prisma.booking.findMany({ where: upcomingWhere(profile.id, now), select: historySelect, orderBy: { scheduledAt: "asc" } }),
    prisma.booking.findMany({
      where: pastWhere(profile.id, now),
      select: historySelect,
      orderBy: { scheduledAt: "desc" },
      skip: (page - 1) * BOOKING_HISTORY_PAGE_SIZE,
      take: BOOKING_HISTORY_PAGE_SIZE,
    }),
    prisma.booking.count({ where: pastWhere(profile.id, now) }),
  ]);

  const live = isCoachLive(profile);
  const expiryState = getBackgroundCheckExpiryState(profile);
  const firstName = profile.user.name.split(" ")[0];
  const accommodations = accommodationsFromProfile(profile);
  const clips = videoClips(profile);
  const toHistory = (b: (typeof upcoming)[number]) => ({
    id: b.id,
    scheduledAt: b.scheduledAt,
    sport: b.sport,
    status: b.status,
    cancelledBy: b.cancelledBy,
    lateCancellation: b.lateCancellation,
    childLevel: b.childLevel,
    childFirstName: b.child?.firstName ?? null,
  });

  const formValues: ProfileFormValues = {
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
  };
  // Profile fields save together and the server checks the whole profile, so a section can only be
  // saved on its own if everything else already passes the same check. Otherwise (missing fields,
  // or values from before a rule existed) they're edited in one form at the top, with every field
  // and its error in view.
  const { sportLevels, ...formRest } = formValues;
  const profileComplete =
    profile.sports.length > 0 &&
    coachProfileSchema.safeParse({
      ...formRest,
      sportLevels: formValues.sports.map((sport) => ({ sport, levels: sportLevels[sport] ?? [] })),
    }).success;
  const fieldEditor = (fields: ProfileFormField[], submitLabel: string) =>
    profileComplete ? (
      <ProfileFieldsEditor initial={formValues} fields={fields} submitLabel={submitLabel} isMinorCoach={profile.isMinorCoach} />
    ) : undefined;

  // Follows the Live / Not live badge, so it doesn't repeat it.
  const statusText = live
    ? "Families can find and book you."
    : profile.isSuspended || profile.user.isSuspended
      ? "Paused. Families can't see your profile right now."
      : expiryState === "EXPIRED"
        ? "Your yearly background check step lapsed."
        : "Families can't see your profile until our team approves it.";

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-6 sm:px-6 md:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-display-lg font-display text-ink">My profile</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
              {live ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Not live</Badge>}
              {statusText}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/coaches/${profile.id}`} className={primaryButtonClass}>
              View as families see it
            </Link>
            <Link href="/onboarding/coach" className={secondaryButtonClass}>
              Verification
            </Link>
          </div>
        </div>
        {!live && (
          <p className="mt-3 text-sm text-muted-foreground">
            Until you&apos;re live, only you and our team can open your public profile.
          </p>
        )}
      </div>

      {/* The top of the public profile, exactly as families see it */}
      <CoachProfileHeader
        coach={{
          name: profile.user.name,
          photoUrl: profile.profilePhotoUrl,
          schoolLevel: profile.schoolLevel,
          schoolName: profile.schoolName,
          gradYear: profile.gradYear,
          city: profile.city,
          state: profile.state,
          sports: profile.sports,
          idVerified: profile.idVerificationStatus === "APPROVED",
          topCoach: isTopCoach(profile.lifetimePoints),
          recommended: profile.recommendations.length > 0,
          videoVerified: hasVerifiedVideoBio(profile),
          minorCoach: ENABLE_MINOR_COACHES && profile.isMinorCoach,
        }}
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 lg:py-12">
        {!profileComplete && (
          <section aria-labelledby="basics-title" className="card p-5 sm:p-6">
            <h2 id="basics-title" className="font-display text-3xl text-ink">Update your basics</h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Some of your sports, school, location, rate or bio details are missing or need updating, and they save
              together. Once they&apos;re all set, you can edit each section on its own below.
            </p>
            <BasicsEditor initial={formValues} isMinorCoach={profile.isMinorCoach} />
          </section>
        )}

        <div className="flex flex-col gap-8">
          <EditableSection id="photo" title="Photo">
            <ProfilePhotoUploader
              approvedUrl={profile.profilePhotoUrl}
              pendingUrl={profile.pendingProfilePhotoUrl}
              rejected={Boolean(profile.profilePhotoRejectedAt)}
            />
          </EditableSection>

          <EditableSection id="school" title="School & location" editor={fieldEditor(["school", "location"], "Save school & location")}>
            <p className="text-ink">{schoolLine(profile) || <span className="text-muted-foreground">Not filled in yet.</span>}</p>
          </EditableSection>

          <EditableSection id="sports" title="Sports & levels" editor={fieldEditor(["sports"], "Save sports & levels")}>
            {profile.sports.length === 0 ? (
              <p className="text-muted-foreground">No sports yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {profile.sports.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <SportPill sport={s.sport} />
                    <LevelTags levels={levelsFromFlags(s)} />
                  </li>
                ))}
              </ul>
            )}
          </EditableSection>

          <EditableSection
            id="hourly-rate"
            title="Rate"
            note="A new rate applies to new bookings and packages. Sessions already booked and packages already bought keep their price."
            editor={fieldEditor(["rate"], "Save rate")}
          >
            {profile.hourlyRateCents ? (
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl leading-none text-pitch">
                  {formatCents(profile.hourlyRateCents).replace(".00", "")}
                </span>
                <span className="text-sm font-bold text-muted-foreground">per hour</span>
              </p>
            ) : (
              <p className="text-muted-foreground">No rate set yet.</p>
            )}
          </EditableSection>

          {/* Section ids mustn't reuse the form's input ids (rate, bio, city...). */}
          <EditableSection id="scouting-report" title="Scouting report" editor={fieldEditor(["bio"], "Save bio")}>
            {profile.bio ? (
              <p className="max-w-prose whitespace-pre-line text-ink/85">{profile.bio}</p>
            ) : (
              <p className="text-muted-foreground">No bio yet.</p>
            )}
          </EditableSection>

          {/* Same order as the public profile from here down. */}
          <EditableSection id="accommodations" title="Accommodations" editor={<AccommodationsForm initial={accommodations} />}>
            {hasAnyAccommodations(accommodations) ? (
              <AccommodationsList accommodations={accommodations} firstName={firstName} city={profile.city} />
            ) : (
              <p className="text-muted-foreground">
                Nothing added yet. Families can see experience with special needs, languages, how far you travel and
                whether you bring equipment. This section stays hidden from families until you add something.
              </p>
            )}
          </EditableSection>

          {/* Saved clips always show here, because families see them even while new uploads are paused. */}
          {(clips.length > 0 || BIO_VIDEO_UPLOADS_ENABLED) && (
            <EditableSection
              id="video"
              title={`Meet ${firstName}`}
              note={
                clips.length > 0
                  ? `Families see ${clips.length === 1 ? "this clip" : "these clips"} on your profile. Removing a clip deletes it.${
                      BIO_VIDEO_UPLOADS_ENABLED ? "" : " New uploads are paused during the beta."
                    }`
                  : undefined
              }
              editor={
                BIO_VIDEO_UPLOADS_ENABLED ? (
                  <BioVideoUpload
                    initial={{
                      intro: { url: profile.introClipUrl, seconds: profile.introClipSeconds },
                      coaching: { url: profile.coachingClipUrl, seconds: profile.coachingClipSeconds },
                      playing: { url: profile.playingClipUrl, seconds: profile.playingClipSeconds },
                    }}
                  />
                ) : undefined
              }
            >
              {clips.length > 0 ? (
                <VideoClips
                  clips={clips}
                  firstName={firstName}
                  action={(clip) => <RemoveClipButton clipType={clip.type} label={clip.label} />}
                />
              ) : (
                <p className="text-muted-foreground">Add short clips so families can meet you.</p>
              )}
            </EditableSection>
          )}

          <EditableSection
            id="availability"
            title="Weekly availability"
            note="Changing your hours doesn't move or cancel sessions already booked."
            editor={
              <AvailabilityEditor
                initial={profile.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMinute: a.startMinute, endMinute: a.endMinute }))}
              />
            }
          >
            <AvailabilityList slots={profile.availability} emptyText="No hours posted yet. Families can't book you until you add some." />
          </EditableSection>

          <EditableSection id="recommendations" title="Coach recommendations">
            {profile.recommendations.length > 0 ? (
              <RecommendationsList recommendations={profile.recommendations} />
            ) : (
              <p className="text-muted-foreground">
                None yet.{" "}
                <Link href="/onboarding/coach#recommendation" className="font-bold text-pitch underline-offset-4 hover:underline">
                  Ask a coach you&apos;ve played for
                </Link>{" "}
                to write one. It adds a &ldquo;Recommended by a coach&rdquo; badge to your profile.
              </p>
            )}
          </EditableSection>

          <ReviewsSection
            headingId="my-reviews"
            firstName={firstName}
            sessionsCompleted={sessionsCompleted}
            reviews={profile.reviews.map((r) => ({
              id: r.id,
              rating: r.rating,
              comment: r.comment,
              reviewer: reviewerName(r.parentProfile.user.name),
              createdAt: r.createdAt,
            }))}
          />
        </div>

        <BookingHistory
          upcoming={upcoming.map(toHistory)}
          past={past.map(toHistory)}
          pastTotal={pastTotal}
          page={page}
          pageSize={BOOKING_HISTORY_PAGE_SIZE}
          now={now}
        />
      </div>
    </div>
  );
}
