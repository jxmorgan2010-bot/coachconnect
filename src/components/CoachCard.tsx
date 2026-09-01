import Link from "next/link";
import Image from "next/image";
import type { CoachCardData } from "@/lib/coach";
import { formatCents } from "@/lib/money";
import { SPORT_COLOR } from "@/lib/sports";
import { IconShieldCheck, IconStar } from "@/components/icons";
import SportPill from "@/components/SportPill";

export default function CoachCard({ coach }: { coach: CoachCardData }) {
  const primarySport = coach.sports[0];
  const bandColor = primarySport ? SPORT_COLOR[primarySport] : { bg: "#1E5631", fg: "#FFFFFF" };

  return (
    <Link
      href={`/coaches/${coach.id}`}
      className="press group relative flex flex-col overflow-hidden rounded-xl border-2 border-ink bg-surface shadow-[6px_6px_0_var(--ink)] hover:bg-chalk"
    >
      {coach.hasRecommendation && (
        <div className="absolute right-[-42px] top-[18px] z-10 w-[160px] rotate-45 border-y-2 border-ink bg-gold py-1 text-center font-display text-[11px] tracking-wide text-ink shadow-[0_2px_0_rgba(0,0,0,0.15)]">
          COACH-RECOMMENDED
        </div>
      )}

      <div className="relative h-44 w-full border-b-2 border-ink" style={{ background: bandColor.bg }}>
        {coach.profilePhotoUrl ? (
          <Image src={coach.profilePhotoUrl} alt={coach.name} fill className="object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-display text-6xl"
            style={{ color: bandColor.fg, opacity: 0.85 }}
          >
            {coach.name.charAt(0)}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t-2 border-ink bg-ink/85 px-3 py-1.5 text-white backdrop-blur-sm">
          <span className="flex items-center gap-1 text-xs font-bold">
            <IconShieldCheck className="h-3.5 w-3.5 text-gold" /> Verified
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

        {coach.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{coach.bio}</p>}
      </div>
    </Link>
  );
}
