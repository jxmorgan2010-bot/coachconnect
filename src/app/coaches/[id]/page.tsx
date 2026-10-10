import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { formatCents } from "@/lib/money";
import Badge from "@/components/Badge";
import SportPill from "@/components/SportPill";
import ReportButton from "@/components/ReportButton";
import MessageCoachButton from "@/components/MessageCoachButton";
import NotRightFitButton from "@/components/NotRightFitButton";
import PaymentProtectionNotice from "@/components/PaymentProtectionNotice";
import { QuickRebookButton } from "@/app/dashboard/BookingActions";
import { isCoachLive, getBackgroundCheckExpiryState, hasVerifiedVideoBio } from "@/lib/coach";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { SPORT_COLOR } from "@/lib/sports";
import { BUNDLE_SESSION_COUNT, BUNDLE_DISCOUNT_PERCENT } from "@/lib/bundles";
import CoachPhotoPlaceholder from "@/components/CoachPhotoPlaceholder";
import NoHoursNotice from "@/components/NoHoursNotice";
import { getCoachSessionsCompleted, getCoachAverageResponseMinutes, formatResponseTime, getSiblingsCoachedForFamily, getPriorBookingCount } from "@/lib/stats";
import { isTopCoach } from "@/lib/points";
import { PRIORITY_REBOOK_THRESHOLD } from "@/lib/rebook";
import { IconShieldCheck, IconStar, IconCalendar } from "@/components/icons";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toTimeString(minutes: number) {
  const h = minutes / 60;
  const hour12 = Math.floor(h) % 12 === 0 ? 12 : Math.floor(h) % 12;
  const ampm = h >= 12 ? "PM" : "AM";
  const min = minutes % 60;
  return `${hour12}${min ? ":" + String(min).padStart(2, "0") : ""}${ampm}`;
}

/** Reviews are public, so show "Dana R." rather than a parent's full name. */
function reviewerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
}

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
      reviews: { include: { parentProfile: { include: { user: true } } }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!profile) notFound();

  const live = isCoachLive(profile);
  const isOwner = session?.user?.id === profile.userId;
  const isAdmin = session?.user?.role === "ADMIN";

  if (!live && !isOwner && !isAdmin) notFound();

  const isMinorCoach = ENABLE_MINOR_COACHES && profile.isMinorCoach;
  const videoVerified = hasVerifiedVideoBio(profile);
  const reviewCount = profile.reviews.length;
  const avgRating = reviewCount ? profile.reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : null;
  const primarySport = profile.sports[0]?.sport;
  const bandColor = primarySport ? SPORT_COLOR[primarySport] : { bg: "var(--pitch)", fg: "#FFFFFF" };
  const expiryState = getBackgroundCheckExpiryState(profile);

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
            ? "Your yearly background check step lapsed. Renew it in onboarding to go live again."
            : "This is a preview — your profile isn't public yet.";
    } else {
      bannerMessage = "Preview only — this profile isn't currently public.";
    }
  }

  const firstName = profile.user.name.split(" ")[0];
  const availabilityByDay = DAYS.map((label, day) => ({
    label,
    slots: profile.availability
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.startMinute - b.startMinute),
  }));
  const isBrandNew = sessionsCompleted === 0 && reviewCount === 0;

  return (
    <div>
      {bannerMessage && (
        <div className="border-b-2 border-ink bg-gold px-4 py-2.5 text-center text-sm font-bold text-ink sm:px-6">
          {bannerMessage}
        </div>
      )}

      {/* Header band in the coach's primary sport color — the front of their trading card */}
      <div className="texture-hatch border-b-2 border-ink" style={{ background: bandColor.bg, color: bandColor.fg }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:gap-8 sm:px-6 sm:py-10">
          <div className="relative h-44 w-36 shrink-0 -rotate-2 overflow-hidden rounded-xl border-2 border-ink bg-white shadow-patch sm:h-52 sm:w-40">
            {profile.profilePhotoUrl ? (
              <Image src={profile.profilePhotoUrl} alt={profile.user.name} fill sizes="160px" className="object-cover" />
            ) : (
              <CoachPhotoPlaceholder
                name={profile.user.name}
                sport={primarySport}
                gradYear={profile.gradYear}
                size="profile"
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-display-lg font-display">{profile.user.name}</h1>
            <p className="mt-2 text-sm font-bold opacity-90">
              {profile.schoolLevel === "COLLEGE" ? "College athlete" : "High school athlete"}
              {profile.schoolName ? ` · ${profile.schoolName}` : ""}
              {profile.gradYear ? ` · Class of ${profile.gradYear}` : ""}
              {profile.city ? ` · ${profile.city}, ${profile.state}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {profile.sports.map((s) => (
                <SportPill key={s.id} sport={s.sport} />
              ))}
            </div>
            {/* Credentials only — numbers live in the stat line beside the booking button */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="neutral" icon={<IconShieldCheck className="h-3.5 w-3.5 text-pitch" />}>ID verified</Badge>
              {isTopCoach(profile.lifetimePoints) && <Badge variant="accent">Top Coach</Badge>}
              {profile.recommendations.length > 0 && <Badge variant="accent">Recommended by a coach</Badge>}
              {videoVerified && <Badge variant="accent">Video intro</Badge>}
              {isMinorCoach && <Badge variant="accent">Minor Coach</Badge>}
            </div>
          </div>
        </div>
      </div>

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
                  <dt className="sr-only">Experience on CoachConnect</dt>
                  <dd>New to the roster — no sessions or reviews yet.</dd>
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
                      {reviewCount > 0 ? (
                        <>
                          {avgRating?.toFixed(1)}
                          <span className="ml-1 font-sans text-xs font-bold text-muted-foreground">({reviewCount})</span>
                        </>
                      ) : (
                        <span className="font-sans text-sm font-bold text-muted-foreground">None yet</span>
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

          {(profile.introClipUrl || profile.coachingClipUrl || profile.playingClipUrl) && (
            <section>
              <h2 className="mb-3 font-display text-3xl text-ink">Meet {firstName}</h2>
              <div className="grid gap-5 sm:grid-cols-3">
                {[
                  { url: profile.introClipUrl, label: "Introduction" },
                  { url: profile.coachingClipUrl, label: "Coaching" },
                  { url: profile.playingClipUrl, label: "Playing" },
                ]
                  .filter((clip) => clip.url)
                  .map((clip) => (
                    <figure key={clip.label}>
                      <video
                        controls
                        preload="metadata"
                        aria-label={`${firstName} — ${clip.label.toLowerCase()} clip`}
                        className="aspect-video w-full rounded-lg border-2 border-ink bg-ink shadow-patch-sm"
                        src={clip.url!}
                      />
                      <figcaption className="eyebrow mt-2 text-muted-foreground">{clip.label}</figcaption>
                    </figure>
                  ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-3xl text-ink">Weekly availability</h2>
            {profile.availability.length === 0 ? (
              <p className="text-muted-foreground">
                {firstName} hasn&apos;t posted regular hours yet. Send a message to ask about times.
              </p>
            ) : (
              <ul className="divide-y-2 divide-line overflow-hidden rounded-lg border-2 border-ink bg-surface">
                {availabilityByDay.map(({ label, slots }) => (
                  <li key={label} className="flex items-center gap-4 px-4 py-3">
                    <span className={`eyebrow w-10 shrink-0 ${slots.length ? "text-ink" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                    {slots.length ? (
                      <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-ink">
                        {slots.map((slot) => (
                          <span key={slot.id} className="inline-flex items-center gap-1.5">
                            <IconCalendar className="h-3.5 w-3.5 text-pitch" aria-hidden />
                            {toTimeString(slot.startMinute)}–{toTimeString(slot.endMinute)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not available</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {profile.recommendations.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-3xl text-ink">Coach recommendations</h2>
              <div className="flex flex-col gap-4">
                {profile.recommendations.map((rec) => (
                  <blockquote key={rec.id} className="border-l-4 border-gold bg-muted py-3 pl-4 pr-3">
                    <p className="text-ink">&ldquo;{rec.content}&rdquo;</p>
                    <footer className="mt-2 text-xs font-bold text-muted-foreground">
                      {rec.recommenderName}
                      {rec.recommenderRole ? ` · ${rec.recommenderRole}` : ""}
                    </footer>
                  </blockquote>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-3xl text-ink">Reviews</h2>
            {profile.reviews.length === 0 ? (
              <p className="text-muted-foreground">No reviews yet. Families can review {firstName} after a completed session.</p>
            ) : (
              <ul className="flex flex-col">
                {profile.reviews.map((review) => (
                  <li key={review.id} className="border-b-2 border-line py-4 first:pt-0 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="flex text-gold" aria-hidden>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <IconStar key={i} className={`h-4 w-4 ${i < review.rating ? "" : "opacity-25"}`} />
                        ))}
                      </span>
                      <span className="sr-only">{review.rating} out of 5 stars</span>
                      <span className="text-xs font-bold text-muted-foreground">
                        {reviewerName(review.parentProfile.user.name)}
                      </span>
                    </div>
                    {review.comment && <p className="mt-1.5 max-w-prose text-sm text-ink/85">{review.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
