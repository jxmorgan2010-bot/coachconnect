import type { CoachProfile } from "@/generated/prisma/client";

/**
 * The coach's Accommodations section: what they say about special-needs experience,
 * languages, travel and equipment. Everything here is coach-reported. It's shown on the public
 * profile as the coach's own words and never as a verified credential. Safe to import from
 * client components.
 */

/** Languages a coach can pick, plus a short "Other" field. Order is the display order. */
export const LANGUAGES = [
  { code: "ENGLISH", label: "English" },
  { code: "SPANISH", label: "Spanish" },
  { code: "MANDARIN", label: "Mandarin" },
  { code: "CANTONESE", label: "Cantonese" },
  { code: "VIETNAMESE", label: "Vietnamese" },
  { code: "TAGALOG", label: "Tagalog" },
  { code: "KOREAN", label: "Korean" },
  { code: "HINDI", label: "Hindi" },
  { code: "PUNJABI", label: "Punjabi" },
  { code: "RUSSIAN", label: "Russian" },
  { code: "JAPANESE", label: "Japanese" },
  { code: "ASL", label: "American Sign Language" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as LanguageCode[];
const LANGUAGE_LABELS = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.label])) as Record<LanguageCode, string>;

export const TRAVEL_RADIUS_OPTIONS = [5, 10, 20] as const;
export type TravelRadius = (typeof TRAVEL_RADIUS_OPTIONS)[number];

export const ACCOMMODATION_NOTE_MAX = 300;
export const OTHER_LANGUAGES_MAX = 60;

export type Accommodations = {
  specialNeedsExperience: boolean;
  /** Only kept while specialNeedsExperience is true. */
  specialNeedsNote: string | null;
  languages: LanguageCode[];
  languagesOther: string | null;
  travelRadiusMiles: TravelRadius | null;
  /** Null when the coach hasn't said. */
  bringsEquipment: boolean | null;
  accommodationsNote: string | null;
};

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as string[]).includes(value);
}

/** Reads the stored JSON array, dropping anything unknown, in list order. Bad JSON reads as none. */
export function parseLanguages(raw: string | null | undefined): LanguageCode[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return LANGUAGE_CODES.filter((code) => parsed.includes(code));
}

/** Codes in list order without duplicates, ready to store. */
export function serializeLanguages(codes: LanguageCode[]): string | null {
  const ordered = LANGUAGE_CODES.filter((code) => codes.includes(code));
  return ordered.length ? JSON.stringify(ordered) : null;
}

function isTravelRadius(value: number | null): value is TravelRadius {
  return value !== null && (TRAVEL_RADIUS_OPTIONS as readonly number[]).includes(value);
}

export function accommodationsFromProfile(
  p: Pick<
    CoachProfile,
    | "specialNeedsExperience"
    | "specialNeedsNote"
    | "languages"
    | "languagesOther"
    | "travelRadiusMiles"
    | "bringsEquipment"
    | "accommodationsNote"
  >,
): Accommodations {
  return {
    specialNeedsExperience: p.specialNeedsExperience,
    specialNeedsNote: p.specialNeedsExperience ? p.specialNeedsNote || null : null,
    languages: parseLanguages(p.languages),
    languagesOther: p.languagesOther || null,
    travelRadiusMiles: isTravelRadius(p.travelRadiusMiles) ? p.travelRadiusMiles : null,
    bringsEquipment: p.bringsEquipment,
    accommodationsNote: p.accommodationsNote || null,
  };
}

/** Language names to show, with the coach's "Other" text last. */
export function languageList(a: Pick<Accommodations, "languages" | "languagesOther">): string[] {
  return [...a.languages.map((code) => LANGUAGE_LABELS[code]), ...(a.languagesOther ? [a.languagesOther] : [])];
}

/** True when there's anything to show. A "no" on equipment alone still counts, since it's an answer. */
export function hasAnyAccommodations(a: Accommodations): boolean {
  return (
    a.specialNeedsExperience ||
    languageList(a).length > 0 ||
    a.travelRadiusMiles !== null ||
    a.bringsEquipment !== null ||
    Boolean(a.accommodationsNote)
  );
}
