import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SPORTS, SPORT_LABELS, isSport } from "@/lib/sports";
import CoachCard from "@/components/CoachCard";
import type { CoachCardData } from "@/lib/coach";
import { inputClass, labelClass, primaryButtonClass } from "@/lib/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SearchParams = {
  sport?: string;
  location?: string;
  maxPrice?: string;
  day?: string;
};

export default async function CoachesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const sportFilter = params.sport && isSport(params.sport) ? params.sport : undefined;
  const locationFilter = params.location?.trim();
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;
  const day = params.day !== undefined && params.day !== "" ? Number(params.day) : undefined;

  const profiles = await prisma.coachProfile.findMany({
    where: {
      idVerificationStatus: "APPROVED",
      backgroundCheckStatus: "CLEAR",
      isSuspended: false,
      backgroundCheckExpiresAt: { gt: new Date() },
      ...(sportFilter ? { sports: { some: { sport: sportFilter } } } : {}),
      ...(locationFilter
        ? { OR: [{ city: { contains: locationFilter } }, { state: { contains: locationFilter } }] }
        : {}),
      ...(maxPrice ? { hourlyRateCents: { lte: Math.round(maxPrice * 100) } } : {}),
      ...(day !== undefined ? { availability: { some: { dayOfWeek: day } } } : {}),
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
      };
    })
    .sort((a, b) => {
      if (a.hasRecommendation !== b.hasRecommendation) return a.hasRecommendation ? -1 : 1;
      const aRating = a.avgRating ?? 0;
      const bRating = b.avgRating ?? 0;
      return bRating - aRating;
    });

  return (
    <div>
      <div className="border-b-2 border-ink bg-pitch texture-hatch text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="font-display text-4xl sm:text-5xl">Find your coach</h1>
          <p className="mt-2 max-w-xl text-white/80">
            Every profile below has cleared both ID verification and a background check — no exceptions.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <form className="card mb-8 grid gap-4 p-5 sm:grid-cols-4" method="get">
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
            <label className={labelClass} htmlFor="location">City or state</label>
            <input id="location" name="location" defaultValue={locationFilter ?? ""} placeholder="e.g. Austin or TX" className={inputClass} />
          </div>

          <div>
            <label className={labelClass} htmlFor="maxPrice">Max price ($/hr)</label>
            <input id="maxPrice" name="maxPrice" type="number" min={0} defaultValue={params.maxPrice ?? ""} className={inputClass} />
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

          <div className="sm:col-span-4 flex items-center justify-end gap-4">
            <Link href="/coaches" className="text-sm font-bold text-muted-foreground hover:text-ink">
              Clear filters
            </Link>
            <button type="submit" className={primaryButtonClass}>
              Search
            </button>
          </div>
        </form>

        {coaches.length === 0 ? (
          <div className="card p-10 text-center text-muted-foreground">
            No coaches match those filters yet. Try widening your search.
          </div>
        ) : (
          <>
            <p className="mb-4 font-display text-lg text-ink">
              {coaches.length} coach{coaches.length === 1 ? "" : "es"} on the roster
            </p>
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
