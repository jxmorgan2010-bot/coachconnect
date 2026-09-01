import type { Sport } from "@/generated/prisma/client";

export const SPORTS: Sport[] = [
  "BASKETBALL",
  "SOCCER",
  "FOOTBALL",
  "LACROSSE",
  "TENNIS",
  "PICKLEBALL",
  "BASEBALL",
];

export const SPORT_LABELS: Record<Sport, string> = {
  BASKETBALL: "Basketball",
  SOCCER: "Soccer",
  FOOTBALL: "Football",
  LACROSSE: "Lacrosse",
  TENNIS: "Tennis",
  PICKLEBALL: "Pickleball",
  BASEBALL: "Baseball",
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
};

export function isSport(value: string): value is Sport {
  return (SPORTS as string[]).includes(value);
}
