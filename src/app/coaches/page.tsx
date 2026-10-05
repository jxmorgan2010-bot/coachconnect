import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SPORTS, SPORT_LABELS, isSport } from "@/lib/sports";
import { BAY_AREA_CITIES, isBayAreaCity } from "@/lib/bayArea";
import CoachCard from "@/components/CoachCard";
import type { CoachCardData } from "@/lib/coach";
import { hasVerifiedVideoBio } from "@/lib/coach";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { PRIORITY_REBOOK_THRESHOLD } from "@/lib/rebook";
import { getCurrentSession } from "@/lib/session";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, goldButtonClass, quietLinkClass } from "@/lib/ui";
import { IconArrowRight } from "@/components/icons";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SearchParams = {
  sport?: string;
  location?: string;
  maxPrice?: string;
  day?: string;
  excludeCoachId?: string;
};

export default async function CoachesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const sportFilter = params.sport && isSport(params.sport) ? params.sport : undefined;
  const locationFilter = params.location && isBayAreaCity(params.location) ? params.location.trim() : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;
  const day = params.day !== undefined && params.day !== "" ? Number(params.day) : undefined;
  const excludeCoachId = params.excludeCoachId?.trim();

  const session = await getCurrentSession();
  let priorBookingCounts = new Map<string, number>();
  if (session?.user?.role === "PARENT") {
    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
    if (parentProfile) {
      const grouped = await prisma.booking.groupBy({
        by: ["coachProfileId"],
        where: { parentProfileId: parentProfile.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
        _count: true,
      });
      priorBookingCounts = new Map(grouped.map((g) => [g.coachProfileId, g._count]));
    }
  }

  // Mirrors isCoachLive()'s two branches (standard adult flow vs. minor coach flow) as a
  // DB-level filter — a plain flag+status where clause can't express "either/or" cleanly.
  const liveFilter = {
    OR: [
      { isMinorCoach: false, idVerificationStatus: "APPROVED" as const, backgroundCheckStatus: "CLEAR" as const, backgroundCheckExpiresAt: { gt: new Date() } },
      ...(ENABLE_MINOR_COACHES
        ? [{ isMinorCoach: true, idVerificationStatus: "APPROVED" as const, minorGuardianConsentedAt: { not: null }, minorBackgroundCheckNote: { not: null } }]
        : []),
    ],
  };

  const profiles = await prisma.coachProfile.findMany({
    where: {
      isSuspended: false,
      // Each condition lives in its own AND entry — liveFilter and the location filter
      // both use an "OR" key, which would silently overwrite each other if merged into
      // one object instead.
      AND: [
        liveFilter,
        ...(sportFilter ? [{ sports: { some: { sport: sportFilter } } }] : []),
        ...(locationFilter ? [{ city: locationFilter }] : []),
        ...(maxPrice ? [{ hourlyRateCents: { lte: Math.round(maxPrice * 100) } }] : []),
        ...(day !== undefined ? [{ availability: { some: { dayOfWeek: day } } }] : []),
        ...(excludeCoachId ? [{ NOT: { id: excludeCoachId } }] : []),
      ],
    },
    include: {
      user: true,
      sports: true,
      recommendations: { where: { status: "SUBMITTED" } },
      reviews: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const coaches: CoachCardData[] = profiles
    .map((p) => {
      const reviewCount = p.reviews.length;
      const avgRating = reviewCount ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : null;
      return {
        id: p.id,
        name: p.user.name,
        bio: p.bio,
        schoolLevel: p.schoolLevel,
        gradYear: p.gradYear,
        hourlyRateCents: p.hourlyRateCents,
        city: p.city,
        state: p.state,
        profilePhotoUrl: p.profilePhotoUrl,
        sports: p.sports.map((s) => s.sport),
        hasRecommendation: p.recommendations.length > 0,
        avgRating,
        reviewCount,
        videoVerified: hasVerifiedVideoBio(p),
        isMinorCoach: ENABLE_MINOR_COACHES && p.isMinorCoach,
        lifetimePoints: p.lifetimePoints,
        priorBookingCount: priorBookingCounts.get(p.id) ?? 0,
      };
    })
    .sort((a, b) => {
      const aPinned = a.priorBookingCount >= PRIORITY_REBOOK_THRESHOLD;
      const bPinned = b.priorBookingCount >= PRIORITY_REBOOK_THRESHOLD;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (a.hasRecommendation !== b.hasRecommendation) return a.hasRecommendation ? -1 : 1;
      const aRating = a.avgRating ?? 0;
      const bRating = b.avgRating ?? 0;
      return bRating - aRating;
    });

  const hasFilters = Boolean(sportFilter || locationFilter || maxPrice || day !== undefined || excludeCoachId);
  const activeFilterLabels = [
    sportFilter && SPORT_LABELS[sportFilter],
    locationFilter,
    maxPrice && `max $${maxPrice}/hr`,
    day !== undefined && DAYS[day],
  ].filter(Boolean) as string[];

  return (
    <div>
      <div className="on-dark texture-hatch border-b-2 border-ink bg-pitch text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
          <p className="eyebrow mb-3 text-gold-bright">Bay Area</p>
          <h1 className="text-display-xl font-display">Find your coach</h1>
          <p className="mt-4 max-w-xl text-white/85">
            High school and college athletes who coach 1&#8209;on&#8209;1. A person on our team has reviewed every
            listed coach&apos;s ID.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
        {/* Nothing to filter on an empty roster, so the form only shows once there's a reason to use it */}
        {(coaches.length > 0 || hasFilters) && (
        <form
          className="card mb-10 grid grid-cols-2 gap-x-3 gap-y-4 p-4 sm:p-5 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end"
          method="get"
          aria-label="Filter coaches"
        >
          <div>
            <label className={labelClass} htmlFor="sport">Sport</label>
            <select id="sport" name="sport" defaultValue={sportFilter ?? ""} className={inputClass}>
              <option value="">All sports</option>
              {SPORTS.map((sport) => (
                <option key={sport} value={sport}>{SPORT_LABELS[sport]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="location">City</label>
            <select id="location" name="location" defaultValue={locationFilter ?? ""} className={inputClass}>
              <option value="">All cities</option>
              {BAY_AREA_CITIES.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="maxPrice">Max $/hr</label>
            <input
              id="maxPrice"
              name="maxPrice"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Any"
              defaultValue={params.maxPrice ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="day">Available on</label>
            <select id="day" name="day" defaultValue={params.day ?? ""} className={inputClass}>
              <option value="">Any day</option>
              {DAYS.map((d, idx) => (
                <option key={d} value={idx}>{d}</option>
              ))}
            </select>
          </div>


          <div className="col-span-2 flex items-center justify-end gap-4 lg:col-span-1">
            {hasFilters && (
              <Link href="/coaches" className={`${quietLinkClass} text-muted-foreground hover:text-ink`}>
                Clear
              </Link>
            )}
            <button type="submit" className={`${primaryButtonClass} flex-1 lg:flex-none`}>
              Search
            </button>
          </div>
        </form>
        )}

        {excludeCoachId && (
          <p className="mb-6 rounded-lg border-2 border-ink bg-accent/15 px-4 py-2.5 text-sm font-bold text-ink">
            Showing other {sportFilter ? `${SPORT_LABELS[sportFilter]} ` : ""}coaches — finding the right fit is normal.
          </p>
        )}

        {coaches.length === 0 ? (
          hasFilters ? (
            <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
              <h2 className="text-display-md font-display text-ink">No coaches match that search</h2>
              <p className="max-w-lg text-muted-foreground">
                {activeFilterLabels.length > 0
                  ? `Your filters: ${activeFilterLabels.join(" · ")}. Try dropping one or two.`
                  : "Nobody else fits right now. Try a broader search."}
              </p>
              <Link href="/coaches" className={secondaryButtonClass}>
                See every coach
              </Link>
            </div>
          ) : (
            // The real launch state: production starts with zero live coaches.
            <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
              <h2 className="text-display-md font-display text-ink">No coaches are listed yet</h2>
              <p className="max-w-lg text-muted-foreground">
                Coaches show up here as soon as an admin approves their ID. Check back soon — or if you played in
                high school or college, you could be one of the first.
              </p>
              <Link href="/signup/coach" className={goldButtonClass}>
                Build your coach profile <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )
        ) : (
          <>
            <h2 className="mb-5 flex items-baseline gap-3 font-display text-ink">
              <span className="text-display-md">
                {coaches.length} coach{coaches.length === 1 ? "" : "es"}
              </span>
              <span className="font-sans text-sm font-bold text-muted-foreground">
                {activeFilterLabels.length > 0 ? activeFilterLabels.join(" · ") : "on the roster"}
              </span>
            </h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {coaches.map((coach) => (
                <CoachCard key={coach.id} coach={coach} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
