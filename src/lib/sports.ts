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
  "GOLF",
  "VOLLEYBALL",
  "TRACK_AND_FIELD",
  "BADMINTON",
  "TABLE_TENNIS",
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
  GOLF: "Golf",
  VOLLEYBALL: "Volleyball",
  TRACK_AND_FIELD: "Track & Field",
  BADMINTON: "Badminton",
  TABLE_TENNIS: "Table Tennis",
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
  GOLF: "GOLF",
  VOLLEYBALL: "VBALL",
  TRACK_AND_FIELD: "T&F",
  BADMINTON: "BDMTN",
  TABLE_TENNIS: "TT",
};

/** One brand color per sport so the roster reads like real team colors, not a single accent repeated. */
export const SPORT_COLOR: Record<Sport, { bg: string; fg: string }> = {
  BASKETBALL: { bg: "#EFB811", fg: "#10201A" },
  SOCCER: { bg: "#277A46", fg: "#FFFFFF" },
  FOOTBALL: { bg: "#10201A", fg: "#FFFFFF" },
  LACROSSE: { bg: "#C6362F", fg: "#FFFFFF" },
  TENNIS: { bg: "#FFCE3D", fg: "#10201A" },
  PICKLEBALL: { bg: "#1E5631", fg: "#FFFFFF" },
  BASEBALL: { bg: "#57614F", fg: "#FFFFFF" },
  SOFTBALL: { bg: "#3B6FA0", fg: "#FFFFFF" },
  MARTIAL_ARTS: { bg: "#7A1F2B", fg: "#FFFFFF" }, // belt oxblood, darker than lacrosse crimson
  BOXING: { bg: "#B5531E", fg: "#FFFFFF" }, // glove leather
  WRESTLING: { bg: "#1F3A5F", fg: "#FFFFFF" }, // singlet navy, darker than softball blue
  GOLF: { bg: "#8DB33A", fg: "#10201A" }, // putting-green lime, lighter and yellower than soccer/pickleball
  VOLLEYBALL: { bg: "#E2C17C", fg: "#10201A" }, // beach sand, paler and browner than the two golds
  TRACK_AND_FIELD: { bg: "#13706B", fg: "#FFFFFF" }, // lane teal, the one blue-green on the board
  BADMINTON: { bg: "#8EC3E6", fg: "#10201A" }, // shuttlecock sky, much lighter than softball blue
  TABLE_TENNIS: { bg: "#6E4B2A", fg: "#FFFFFF" }, // paddle-blade wood
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
  GOLF: "e.g. a public driving range or putting green",
  VOLLEYBALL: "e.g. a rec center gym or public beach/sand court",
  TRACK_AND_FIELD: "e.g. a public track",
  BADMINTON: "e.g. a rec center or community badminton court",
  TABLE_TENNIS: "e.g. a rec center or table tennis club",
};

/** How the home page groups sports under "Browse by sport", in display order. */
export const SPORT_GROUPS = [
  { id: "TEAM", label: "Team sports" },
  { id: "RACKET", label: "Racket & paddle" },
  { id: "INDIVIDUAL", label: "Individual" },
  { id: "COMBAT", label: "Combat" },
] as const;
export type SportGroup = (typeof SPORT_GROUPS)[number]["id"];

/** Every sport's group. A new sport added above has to pick one, and then shows up in it. */
export const SPORT_GROUP: Record<Sport, SportGroup> = {
  BASKETBALL: "TEAM",
  SOCCER: "TEAM",
  FOOTBALL: "TEAM",
  LACROSSE: "TEAM",
  BASEBALL: "TEAM",
  SOFTBALL: "TEAM",
  VOLLEYBALL: "TEAM",
  TENNIS: "RACKET",
  PICKLEBALL: "RACKET",
  BADMINTON: "RACKET",
  TABLE_TENNIS: "RACKET",
  GOLF: "INDIVIDUAL",
  TRACK_AND_FIELD: "INDIVIDUAL",
  MARTIAL_ARTS: "COMBAT",
  BOXING: "COMBAT",
  WRESTLING: "COMBAT",
};

/** The sports in one group, in SPORTS order. */
export function sportsInGroup(group: SportGroup): Sport[] {
  return SPORTS.filter((sport) => SPORT_GROUP[sport] === group);
}

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
