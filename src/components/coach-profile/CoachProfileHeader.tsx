import Image from "next/image";
import type { CoachSport, CoachType, SchoolLevel } from "@/generated/prisma/client";
import Badge from "@/components/Badge";
import SportPill from "@/components/SportPill";
import LevelTags from "@/components/LevelTags";
import CoachPhotoPlaceholder from "@/components/CoachPhotoPlaceholder";
import { IconShieldCheck } from "@/components/icons";
import { levelsFromFlags } from "@/lib/skillLevels";
import { SPORT_COLOR } from "@/lib/sports";
import { COACH_TYPE_LABELS, coachKindLabel } from "@/lib/coachTypes";
import { EXPERIENCED_COACHES_ENABLED } from "@/lib/features";

export type CoachHeaderData = {
  name: string;
  /** The approved photo only. A photo waiting for review is never shown here. */
  photoUrl: string | null;
  coachType: CoachType;
  schoolLevel: SchoolLevel | null;
  schoolName: string | null;
  gradYear: number | null;
  city: string | null;
  state: string | null;
  sports: CoachSport[];
  idVerified: boolean;
  topCoach: boolean;
  recommended: boolean;
  videoVerified: boolean;
  minorCoach: boolean;
};

/** One line under the name: kind of coach, then school and class year (student-athletes) and city. */
export function coachLine(
  c: Pick<CoachHeaderData, "coachType" | "schoolLevel" | "schoolName" | "gradYear" | "city" | "state">,
): string {
  const student = c.coachType === "STUDENT_ATHLETE";
  return [
    coachKindLabel(c),
    student ? c.schoolName : null,
    student && c.gradYear ? `Class of ${c.gradYear}` : null,
    c.city ? `${c.city}${c.state ? `, ${c.state}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The header band in the coach's primary sport color: the front of their trading card. */
export default function CoachProfileHeader({ coach }: { coach: CoachHeaderData }) {
  const primarySport = coach.sports[0]?.sport;
  const bandColor = primarySport ? SPORT_COLOR[primarySport] : { bg: "var(--pitch)", fg: "#FFFFFF" };
  const line = coachLine(coach);

  return (
    <div className="texture-hatch border-b-2 border-ink" style={{ background: bandColor.bg, color: bandColor.fg }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:gap-8 sm:px-6 sm:py-10">
        <div className="relative h-44 w-36 shrink-0 -rotate-2 overflow-hidden rounded-xl border-2 border-ink bg-white shadow-patch sm:h-52 sm:w-40">
          {coach.photoUrl ? (
            <Image src={coach.photoUrl} alt={coach.name} fill sizes="160px" className="object-cover" />
          ) : (
            <CoachPhotoPlaceholder name={coach.name} sport={primarySport} gradYear={coach.gradYear} size="profile" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-display-lg font-display break-words">{coach.name}</h1>
          {line && <p className="mt-2 text-sm font-bold opacity-90">{line}</p>}
          {coach.sports.length > 0 && (
            <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Sports and levels">
              {coach.sports.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <SportPill sport={s.sport} />
                  <LevelTags levels={levelsFromFlags(s)} inheritColor />
                </li>
              ))}
            </ul>
          )}
          {/* Credentials only — numbers live in the stat line beside the booking button */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {coach.idVerified && (
              <Badge variant="neutral" icon={<IconShieldCheck className="h-3.5 w-3.5 text-pitch" />}>ID verified</Badge>
            )}
            {EXPERIENCED_COACHES_ENABLED && <Badge variant="neutral">{COACH_TYPE_LABELS[coach.coachType]}</Badge>}
            {coach.topCoach && <Badge variant="accent">Top Coach</Badge>}
            {coach.recommended && <Badge variant="accent">Recommended by a coach</Badge>}
            {coach.videoVerified && <Badge variant="accent">Video intro</Badge>}
            {coach.minorCoach && <Badge variant="accent">Minor Coach</Badge>}
          </div>
        </div>
      </div>
    </div>
  );
}
