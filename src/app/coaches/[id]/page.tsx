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
import { isCoachLive, getBackgroundCheckExpiryState } from "@/lib/coach";
import { SPORT_COLOR } from "@/lib/sports";
import { getCoachSessionsCompleted, getCoachAverageResponseMinutes, formatResponseTime, getSiblingsCoachedForFamily } from "@/lib/stats";
import { IconShieldCheck, IconStar, IconCalendar } from "@/components/icons";
import { primaryButtonClass } from "@/lib/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toTimeString(minutes: number) {
  const h = minutes / 60;
  const hour12 = Math.floor(h) % 12 === 0 ? 12 : Math.floor(h) % 12;
  const ampm = h >= 12 ? "PM" : "AM";
  const min = minutes % 60;
  return `${hour12}${min ? ":" + String(min).padStart(2, "0") : ""}${ampm}`;
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

  const reviewCount = profile.reviews.length;
  const avgRating = reviewCount ? profile.reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : null;
  const primarySport = profile.sports[0]?.sport;
  const bandColor = primarySport ? SPORT_COLOR[primarySport] : { bg: "#1E5631", fg: "#FFFFFF" };
  const expiryState = getBackgroundCheckExpiryState(profile);

  const [sessionsCompleted, avgResponseMinutes] = await Promise.all([
    getCoachSessionsCompleted(profile.id),
    getCoachAverageResponseMinutes(profile.id),
  ]);

  let siblingNote: string | null = null;
  if (session?.user?.role === "PARENT" && !isOwner) {
    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
    if (parentProfile) {
      const siblings = await getSiblingsCoachedForFamily(profile.id, parentProfile.id);
      if (siblings.length > 0) {
        siblingNote = `Coached ${siblings.join(" and ")} too`;
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
            ? "Your background check has expired. Renew it below to go live again."
            : "This is a preview — your profile isn't public yet.";
    } else {
      bannerMessage = "Preview only — this profile isn't currently public.";
    }
  }

  return (
    <div>
      {bannerMessage && (
        <div className="border-b-2 border-ink bg-gold px-4 py-2.5 text-center text-sm font-bold text-ink sm:px-6">
          {bannerMessage}
        </div>
      )}

      {/* Header band, colored by the coach's primary sport — a roster-card treatment, not a plain profile header */}
      <div className="border-b-2 border-ink text-white" style={{ background: bandColor.bg, color: bandColor.fg }}>
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:px-6">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-xl border-2 border-ink bg-white shadow-[5px_5px_0_var(--ink)]">
            {profile.profilePhotoUrl ? (
              <div className="relative h-full w-full">
                <Image src={profile.profilePhotoUrl} alt={profile.user.name} fill className="object-cover" />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-5xl text-ink/30">
                {profile.user.name.charAt(0)}
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-4xl leading-none sm:text-5xl">{profile.user.name}</h1>
                <p className="mt-2 text-sm font-bold opacity-90">
                  {profile.schoolLevel === "COLLEGE" ? "College athlete" : "High school athlete"}
                  {profile.schoolName ? ` · ${profile.schoolName}` : ""}
                  {profile.gradYear ? ` · Class of ${profile.gradYear}` : ""}
                  {profile.city ? ` · ${profile.city}, ${profile.state}` : ""}
                </p>
              </div>
              {profile.hourlyRateCents && (
                <div className="rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-center text-ink shadow-[3px_3px_0_var(--ink)]">
                  <div className="font-display text-2xl leading-none">{formatCents(profile.hourlyRateCents).replace(".00", "")}</div>
                  <div className="text-[10px] font-bold text-muted-foreground">per hour</div>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.sports.map((s) => (
                <SportPill key={s.id} sport={s.sport} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {siblingNote && (
          <div className="mb-6 rounded-lg border-2 border-ink bg-accent/20 px-4 py-2.5 text-sm font-bold text-ink">
            {siblingNote}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge variant="success" icon={<IconShieldCheck className="h-3.5 w-3.5" />}>Background check clear</Badge>
          <Badge variant="success" icon={<IconShieldCheck className="h-3.5 w-3.5" />}>ID verified</Badge>
          {profile.recommendations.length > 0 && <Badge variant="accent">Recommended by Coach</Badge>}
          {reviewCount > 0 ? (
            <Badge variant="neutral" icon={<IconStar className="h-3.5 w-3.5 text-gold" />}>
              {avgRating?.toFixed(1)} ({reviewCount} review{reviewCount === 1 ? "" : "s"})
            </Badge>
          ) : (
            <Badge variant="neutral">New to the roster</Badge>
          )}
          <Badge variant="neutral">{sessionsCompleted} session{sessionsCompleted === 1 ? "" : "s"} completed</Badge>
          {avgResponseMinutes !== null && (
            <Badge variant="neutral">Responds in {formatResponseTime(avgResponseMinutes)}</Badge>
          )}
        </div>

        <div className="mb-8 flex flex-wrap gap-3">
          {live ? (
            <Link href={`/coaches/${profile.id}/book`} className={primaryButtonClass}>
              Book a session
            </Link>
          ) : (
            <button className={primaryButtonClass} disabled title="This coach isn't currently bookable">
              Book a session
            </button>
          )}
          {!isOwner && <MessageCoachButton coachProfileId={profile.id} />}
          {!isOwner && <ReportButton targetType="COACH_PROFILE" targetId={profile.id} />}
        </div>

        {profile.introVideoUrl && (
          <section className="mb-8">
            <h2 className="mb-2 font-display text-2xl text-ink">Meet {profile.user.name.split(" ")[0]}</h2>
            <video
              controls
              className="w-full max-w-sm rounded-lg border-2 border-ink shadow-[4px_4px_0_var(--ink)]"
              src={profile.introVideoUrl}
            />
          </section>
        )}

        {profile.bio && (
          <section className="mb-8">
            <h2 className="mb-2 font-display text-2xl text-ink">Scouting report</h2>
            <p className="whitespace-pre-line text-muted-foreground">{profile.bio}</p>
          </section>
        )}

        {profile.availability.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-display text-2xl text-ink">Weekly availability</h2>
            <div className="flex flex-col divide-y-2 divide-line rounded-lg border-2 border-ink">
              {profile.availability
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute)
                .map((slot) => (
                  <div key={slot.id} className="flex items-center gap-3 px-4 py-2.5">
                    <IconCalendar className="h-4 w-4 shrink-0 text-pitch" />
                    <span className="w-12 font-display text-sm tracking-wide text-ink">{DAYS[slot.dayOfWeek]}</span>
                    <span className="text-sm text-muted-foreground">
                      {toTimeString(slot.startMinute)}–{toTimeString(slot.endMinute)}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {profile.recommendations.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-display text-2xl text-ink">Coach recommendations</h2>
            <div className="flex flex-col gap-4">
              {profile.recommendations.map((rec) => (
                <div key={rec.id} className="border-l-4 border-gold bg-muted py-2 pl-4">
                  <p className="text-ink">&ldquo;{rec.content}&rdquo;</p>
                  <p className="mt-2 text-xs font-bold text-muted-foreground">
                    {rec.recommenderName} &middot; {rec.recommenderRole}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">Reviews</h2>
          {profile.reviews.length === 0 ? (
            <p className="text-muted-foreground">No reviews yet — be the first to book a session.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {profile.reviews.map((review) => (
                <div key={review.id} className="border-b-2 border-line pb-4 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="flex text-gold">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <IconStar key={i} className="h-4 w-4" />
                      ))}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">{review.parentProfile.user.name}</span>
                  </div>
                  {review.comment && <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
