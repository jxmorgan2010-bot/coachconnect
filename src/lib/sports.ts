import type { Sport } from "@/generated/prisma/client";

export const SPORTS: Sport[] = [
  "BASKETBALL",
  "SOCCER",
  "FOOTBALL",
  "LACROSSE",
  "TENNIS",
  "PICKLEBALL",
  "BASEBALL",
  "SOFTBALL",
  "MARTIAL_ARTS",
  "BOXING",
  "WRESTLING",
];

export const SPORT_LABELS: Record<Sport, string> = {
  BASKETBALL: "Basketball",
  SOCCER: "Soccer",
  FOOTBALL: "Football",
  LACROSSE: "Lacrosse",
  TENNIS: "Tennis",
  PICKLEBALL: "Pickleball",
  BASEBALL: "Baseball",
  SOFTBALL: "Softball",
  MARTIAL_ARTS: "Martial Arts",
  BOXING: "Boxing",
  WRESTLING: "Wrestling",
};

/** Roster-style abbreviations, the way these sports actually get shorthanded on a schedule board. */
export const SPORT_TAG: Record<Sport, string> = {
  BASKETBALL: "BBALL",
  SOCCER: "SOCCER",
  FOOTBALL: "FTBL",
  LACROSSE: "LAX",
  TENNIS: "TNS",
  PICKLEBALL: "PKL",
  BASEBALL: "BSB",
  SOFTBALL: "SFTBL",
  MARTIAL_ARTS: "MA",
  BOXING: "BOX",
  WRESTLING: "WRES",
};

/** One brand color per sport so the roster reads like real team colors, not a single accent repeated. */
export const SPORT_COLOR: Record<Sport, { bg: string; fg: string }> = {
  BASKETBALL: { bg: "#EFB811", fg: "#10201A" },
  SOCCER: { bg: "#2F8F52", fg: "#FFFFFF" },
  FOOTBALL: { bg: "#10201A", fg: "#FFFFFF" },
  LACROSSE: { bg: "#C6362F", fg: "#FFFFFF" },
  TENNIS: { bg: "#FFCE3D", fg: "#10201A" },
  PICKLEBALL: { bg: "#1E5631", fg: "#FFFFFF" },
  BASEBALL: { bg: "#57614F", fg: "#FFFFFF" },
  SOFTBALL: { bg: "#3B6FA0", fg: "#FFFFFF" },
  MARTIAL_ARTS: { bg: "#7A1F2B", fg: "#FFFFFF" }, // belt oxblood, darker than lacrosse crimson
  BOXING: { bg: "#B5531E", fg: "#FFFFFF" }, // glove leather
  WRESTLING: { bg: "#1F3A5F", fg: "#FFFFFF" }, // singlet navy, darker than softball blue
};

/** Placeholder for the booking form's location field, so the example fits the sport. */
export const SPORT_PLACE_EXAMPLE: Record<Sport, string> = {
  BASKETBALL: "e.g. the rec center gym, court 2",
  SOCCER: "e.g. the park's soccer field by the playground",
  FOOTBALL: "e.g. the high school field, home side",
  LACROSSE: "e.g. the turf field at the park",
  TENNIS: "e.g. Golden Gate Park tennis courts",
  PICKLEBALL: "e.g. the rec center pickleball courts",
  BASEBALL: "e.g. the park's baseball diamond",
  SOFTBALL: "e.g. the park's softball field",
  MARTIAL_ARTS: "e.g. a rec center mat room, or a dojo open to drop-ins",
  BOXING: "e.g. a boxing gym that takes drop-ins",
  WRESTLING: "e.g. a school wrestling room or rec center mat room",
};

/**
 * Sports coaches under 18 can't offer yet. This list is the whole rule: the coach sports
 * picker greys these out and PATCH /api/coach/profile refuses them. Remove a sport here
 * to open it to under-18 coaches.
 */
export const ADULT_ONLY_SPORTS: Sport[] = ["MARTIAL_ARTS", "BOXING", "WRESTLING"];
export const ADULT_ONLY_SPORT_NOTE = "Not available for coaches under 18 yet.";

export function isSportAllowedForCoach(sport: Sport, isMinorCoach: boolean): boolean {
  return !isMinorCoach || !ADULT_ONLY_SPORTS.includes(sport);
}

export function isSport(value: string): value is Sport {
  return (SPORTS as string[]).includes(value);
}
