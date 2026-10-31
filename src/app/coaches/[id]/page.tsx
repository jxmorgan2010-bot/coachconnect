import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { formatCents } from "@/lib/money";
import ReportButton from "@/components/ReportButton";
import MessageCoachButton from "@/components/MessageCoachButton";
import NotRightFitButton from "@/components/NotRightFitButton";
import PaymentProtectionNotice from "@/components/PaymentProtectionNotice";
import { QuickRebookButton } from "@/app/dashboard/BookingActions";
import { isCoachLive, getBackgroundCheckExpiryState, hasVerifiedVideoBio } from "@/lib/coach";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { BUNDLE_SESSION_COUNT, BUNDLE_DISCOUNT_PERCENT } from "@/lib/bundles";
import NoHoursNotice from "@/components/NoHoursNotice";
import CoachProfileHeader from "@/components/coach-profile/CoachProfileHeader";
import AvailabilityList from "@/components/coach-profile/AvailabilityList";
import AccommodationsList from "@/components/coach-profile/AccommodationsList";
import ExperienceList, { hasAnyExperience } from "@/components/coach-profile/ExperienceList";
import { EXPERIENCED_COACHES_ENABLED } from "@/lib/features";
import RecommendationsList from "@/components/coach-profile/RecommendationsList";
import ReviewsSection from "@/components/coach-profile/ReviewsSection";
import VideoClips, { videoClips } from "@/components/coach-profile/VideoClips";
import { accommodationsFromProfile, hasAnyAccommodations } from "@/lib/accommodations";
import { reviewerName, summarizeReviews, formatAverage } from "@/lib/reviews";
import { getCoachSessionsCompleted, getCoachAverageResponseMinutes, formatResponseTime, getSiblingsCoachedForFamily, getPriorBookingCount } from "@/lib/stats";
import { isTopCoach } from "@/lib/points";
import { PRIORITY_REBOOK_THRESHOLD } from "@/lib/rebook";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";

export default async function CoachProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();

  const profile = await prisma.coachProfile.findUnique({
    where: { id },
    include: {
      user: true,
      sports: true,
      availability: true,
      recommendations: { where: { status: "SUBMITTED" } },
      reviews: { include: { parentProfile: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!profile) notFound();

  const live = isCoachLive(profile);
  const isOwner = session?.user?.id === profile.userId;
  const isAdmin = session?.user?.role === "ADMIN";

  if (!live && !isOwner && !isAdmin) notFound();

  const isMinorCoach = ENABLE_MINOR_COACHES && profile.isMinorCoach;
  const { count: reviewCount, average: avgRating } = summarizeReviews(profile.reviews.map((r) => r.rating));
  const primarySport = profile.sports[0]?.sport;
  const expiryState = getBackgroundCheckExpiryState(profile);
  const accommodations = accommodationsFromProfile(profile);
  const clips = videoClips(profile);

  const [sessionsCompleted, avgResponseMinutes] = await Promise.all([
    getCoachSessionsCompleted(profile.id),
    getCoachAverageResponseMinutes(profile.id),
  ]);

  let siblingNote: string | null = null;
  let quickRebookBookingId: string | null = null;
  if (session?.user?.role === "PARENT" && !isOwner) {
    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
    if (parentProfile) {
      const siblings = await getSiblingsCoachedForFamily(profile.id, parentProfile.id);
      if (siblings.length > 0) {
        siblingNote = `Coached ${siblings.join(" and ")} too`;
      }

      const priorBookingCount = await getPriorBookingCount(profile.id, parentProfile.id);
      if (priorBookingCount >= PRIORITY_REBOOK_THRESHOLD) {
        const mostRecent = await prisma.booking.findFirst({
          where: { coachProfileId: profile.id, parentProfileId: parentProfile.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
          orderBy: { scheduledAt: "desc" },
        });
        quickRebookBookingId = mostRecent?.id ?? null;
      }
    }
  }

  let bannerMessage: string | null = null;
  if (!live) {
    if (isOwner) {
      bannerMessage =
        profile.isSuspended
          ? "Your profile is paused pending an admin review of recent reports."
          : expiryState === "EXPIRED"
            ? "Your yearly background check step lapsed. Your profile goes live again once our team marks this step."
            : "This is a preview — your profile isn't public yet.";
    } else {
      bannerMessage = "Preview only — this profile isn't currently public.";
    }
  }

  const firstName = profile.user.name.split(" ")[0];
  const isBrandNew = sessionsCompleted === 0 && reviewCount === 0;

  return (
    <div>
      {bannerMessage && (
        <div className="border-b-2 border-ink bg-gold px-4 py-2.5 text-center text-sm font-bold text-ink sm:px-6">
          {bannerMessage}
        </div>
      )}

      <CoachProfileHeader
        coach={{
          name: profile.user.name,
          photoUrl: profile.profilePhotoUrl,
          coachType: profile.coachType,
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
          minorCoach: isMinorCoach,
        }}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 lg:py-12">
        {/* BOOKING RAIL — sticky right column on desktop. On phones the wrapper is
            display:contents so the booking card leads, the bio follows, and the
            payment notice + secondary links drop below the profile (order-*). */}
        <aside
          aria-label="Book this coach"
          className="contents lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-5 lg:self-start"
        >
          <div className="card order-1 p-5">
            {profile.hourlyRateCents && (
              <p className="mb-4 flex items-baseline gap-1.5">
                <span className="font-display text-4xl leading-none text-pitch">
                  {formatCents(profile.hourlyRateCents).replace(".00", "")}
                </span>
                <span className="text-sm font-bold text-muted-foreground">per hour</span>
              </p>
            )}

            <div className="flex flex-col gap-3">
              {live && profile.availability.length === 0 ? (
                <NoHoursNotice coachFirstName={firstName} coachProfileId={profile.id} compact />
              ) : live ? (
                <>
                  <Link href={`/coaches/${profile.id}/book`} className={`${primaryButtonClass} w-full`}>
                    Book a session
                  </Link>
                  {profile.hourlyRateCents && (
                    <Link href={`/coaches/${profile.id}/packages`} className={`${secondaryButtonClass} w-full`}>
                      {BUNDLE_SESSION_COUNT}-session package · save {BUNDLE_DISCOUNT_PERCENT}%
                    </Link>
                  )}
                </>
              ) : (
                <button className={`${primaryButtonClass} w-full`} disabled title="This coach isn't currently bookable">
                  Book a session
                </button>
              )}
              {!isOwner && <MessageCoachButton coachProfileId={profile.id} />}
            </div>

            {quickRebookBookingId && (
              <div className="mt-4 flex flex-col gap-2 border-t-2 border-line pt-4">
                <p className="text-sm font-bold text-ink">You&apos;ve booked {firstName} before.</p>
                <QuickRebookButton bookingId={quickRebookBookingId} coachName={firstName} />
              </div>
            )}

            {/* Stat line — every number is computed from real bookings/reviews/messages */}
            <dl className="mt-5 grid grid-cols-3 gap-2 border-t-2 border-line pt-4 text-center">
              {isBrandNew ? (
                <div className="col-span-3 text-sm text-muted-foreground">
                  <dt className="sr-only">Experience on Assist Coaching</dt>
                  <dd>New coach, no reviews yet.</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Sessions</dt>
                    <dd className="mt-1 font-display text-2xl leading-none text-ink">{sessionsCompleted}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Rating</dt>
                    <dd className="mt-1 font-display text-2xl leading-none text-ink">
                      {avgRating !== null ? (
                        <>
                          {formatAverage(avgRating)}
                          <span className="ml-1 font-sans text-xs font-bold text-muted-foreground">({reviewCount})</span>
                        </>
                      ) : (
                        <span className="font-sans text-sm font-bold text-muted-foreground">No reviews yet</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Replies</dt>
                    <dd className="mt-1 font-display text-2xl leading-none text-ink">
                      {avgResponseMinutes !== null ? (
                        formatResponseTime(avgResponseMinutes)
                      ) : (
                        <span className="font-sans text-sm font-bold text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          {(live || !isOwner) && (
            <div className="order-3 flex flex-col gap-4">
              {live && <PaymentProtectionNotice />}
              {!isOwner && (
                <div className="flex flex-wrap items-center gap-x-5">
                  <NotRightFitButton coachProfileId={profile.id} sport={primarySport} city={profile.city} variant="quiet" />
                  <ReportButton targetType="COACH_PROFILE" targetId={profile.id} variant="quiet" />
                </div>
              )}
            </div>
          )}
        </aside>

        {/* PROFILE BODY */}
        <div className="order-2 flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-1">
          {siblingNote && (
            <p className="rounded-lg border-2 border-ink bg-accent/20 px-4 py-2.5 text-sm font-bold text-ink">
              {siblingNote}
            </p>
          )}

          {isMinorCoach && (
            <section className="rounded-lg border-2 border-ink bg-accent/10 p-4">
              <h2 className="mb-1 font-display text-xl text-ink">Minor Coach</h2>
              <p className="text-sm text-muted-foreground">
                {firstName} is under 18, and their parent or guardian has signed a consent form. Every session with{" "}
                {firstName} needs two adults there: you, the parent booking, plus one more adult. You&apos;ll name the
                second adult when you book.
              </p>
            </section>
          )}

          {profile.bio && (
            <section>
              <h2 className="mb-3 font-display text-3xl text-ink">Scouting report</h2>
              <p className="max-w-prose whitespace-pre-line text-ink/85">{profile.bio}</p>
            </section>
          )}

          {EXPERIENCED_COACHES_ENABLED && profile.coachType === "EXPERIENCED" && hasAnyExperience(profile) && (
            <section aria-labelledby="experience">
              <h2 id="experience" className="mb-3 font-display text-3xl text-ink">Coaching experience</h2>
              <ExperienceList experience={profile} firstName={firstName} />
            </section>
          )}

          {hasAnyAccommodations(accommodations) && (
            <section aria-labelledby="accommodations">
              <h2 id="accommodations" className="mb-3 font-display text-3xl text-ink">Accommodations</h2>
              <AccommodationsList accommodations={accommodations} firstName={firstName} city={profile.city} />
            </section>
          )}

          {clips.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-3xl text-ink">Meet {firstName}</h2>
              <VideoClips clips={clips} firstName={firstName} />
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-3xl text-ink">Weekly availability</h2>
            <AvailabilityList
              slots={profile.availability}
              emptyText={`${firstName} hasn't posted regular hours yet. Send a message to ask about times.`}
            />
          </section>

          {profile.recommendations.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-3xl text-ink">Coach recommendations</h2>
              <RecommendationsList recommendations={profile.recommendations} />
            </section>
          )}

          <ReviewsSection
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
      </div>
    </div>
  );
}
