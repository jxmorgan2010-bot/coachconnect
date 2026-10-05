import Link from "next/link";
import Image from "next/image";
import type { CoachCardData } from "@/lib/coach";
import { formatCents } from "@/lib/money";
import { isTopCoach } from "@/lib/points";
import { PRIORITY_REBOOK_THRESHOLD } from "@/lib/rebook";
import { IconShieldCheck, IconStar, IconPin } from "@/components/icons";
import SportPill from "@/components/SportPill";
import Badge from "@/components/Badge";
import CoachPhotoPlaceholder from "@/components/CoachPhotoPlaceholder";

export default function CoachCard({ coach }: { coach: CoachCardData }) {
  const primarySport = coach.sports[0];
  const pinned = coach.priorBookingCount >= PRIORITY_REBOOK_THRESHOLD;

  return (
    <Link
      href={`/coaches/${coach.id}`}
      className="press group relative flex flex-col overflow-hidden rounded-xl border-2 border-ink bg-surface shadow-patch hover:bg-chalk"
    >
      {pinned && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full border-2 border-ink bg-accent px-2 py-0.5 text-[11px] font-bold text-ink shadow-patch-xs">
          <IconPin className="h-3 w-3" /> Book again
        </div>
      )}
      {coach.hasRecommendation && (
        // Sits far enough down the corner that the whole label fits inside the card's diagonal.
        <div className="absolute right-[-58px] top-[30px] z-10 w-[210px] rotate-45 border-y-2 border-ink bg-gold py-1 text-center font-display text-[11px] tracking-wide text-ink">
          COACH-RECOMMENDED
        </div>
      )}

      <div className="relative h-44 w-full border-b-2 border-ink">
        {coach.profilePhotoUrl ? (
          <Image
            src={coach.profilePhotoUrl}
            alt={coach.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <CoachPhotoPlaceholder name={coach.name} sport={primarySport} />
        )}
        {/* Solid ink strip, not a blurred overlay */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t-2 border-ink bg-ink px-3 py-1.5 text-white">
          <span className="flex items-center gap-1 text-xs font-bold">
            <IconShieldCheck className="h-3.5 w-3.5 text-gold" /> ID verified
          </span>
          {coach.reviewCount > 0 ? (
            <span className="flex items-center gap-1 text-xs font-bold">
              <IconStar className="h-3.5 w-3.5 text-gold" />
              {coach.avgRating?.toFixed(1)} ({coach.reviewCount})
            </span>
          ) : (
            <span className="text-xs font-bold text-white/70">New to the roster</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-2xl leading-none text-ink">{coach.name}</h3>
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              {coach.schoolLevel === "COLLEGE" ? "College athlete" : "High school athlete"}
              {coach.city ? ` · ${coach.city}, ${coach.state}` : ""}
            </p>
          </div>
          {coach.hourlyRateCents && (
            <div className="shrink-0 rounded-lg border-2 border-ink bg-chalk px-2 py-1 text-center leading-none">
              <div className="font-display text-lg text-pitch">{formatCents(coach.hourlyRateCents).replace(".00", "")}</div>
              <div className="text-[10px] font-bold text-muted-foreground">per hr</div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {coach.sports.slice(0, 4).map((sport) => (
            <SportPill key={sport} sport={sport} />
          ))}
          {coach.sports.length > 4 && (
            <span className="text-xs font-bold text-muted-foreground">+{coach.sports.length - 4}</span>
          )}
        </div>

        {(coach.videoVerified || coach.isMinorCoach || isTopCoach(coach.lifetimePoints)) && (
          <div className="flex flex-wrap gap-1.5">
            {isTopCoach(coach.lifetimePoints) && <Badge variant="accent">Top Coach</Badge>}
            {coach.videoVerified && <Badge variant="accent">Video verified</Badge>}
            {coach.isMinorCoach && <Badge variant="accent">Minor Coach</Badge>}
          </div>
        )}

        {coach.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{coach.bio}</p>}
      </div>
    </Link>
  );
}
