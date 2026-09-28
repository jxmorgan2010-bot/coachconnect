/**
 * Bay Area launch-market restriction. CoachConnect is limited to the 9 core Bay Area
 * counties at launch — see evaluateCoachLocationEligibility, used at coach signup, and
 * the city select on the coach profile form / coach search filter, both of which are
 * restricted to BAY_AREA_CITIES so free text can't drift outside the list below.
 *
 * The zip list is a curated set of common city zip codes per county, not an exhaustive
 * government dataset — extend it if a real signup gets rejected for a legitimate Bay
 * Area zip that's missing.
 */

export const BAY_AREA_COUNTIES = [
  "San Francisco",
  "San Mateo",
  "Santa Clara",
  "Alameda",
  "Contra Costa",
  "Marin",
  "Napa",
  "Solano",
  "Sonoma",
] as const;

export type BayAreaCounty = (typeof BAY_AREA_COUNTIES)[number];

type BayAreaZipEntry = { zip: string; city: string; county: BayAreaCounty };

const SAN_FRANCISCO: BayAreaZipEntry[] = [
  "94102", "94103", "94104", "94105", "94107", "94108", "94109", "94110",
  "94111", "94112", "94114", "94115", "94116", "94117", "94118", "94119",
  "94121", "94122", "94123", "94124", "94125", "94127", "94129", "94130",
  "94131", "94132", "94133", "94134", "94158",
].map((zip) => ({ zip, city: "San Francisco", county: "San Francisco" }));

const SAN_MATEO: BayAreaZipEntry[] = [
  { zip: "94401", city: "San Mateo" },
  { zip: "94402", city: "San Mateo" },
  { zip: "94403", city: "San Mateo" },
  { zip: "94404", city: "Foster City" },
  { zip: "94061", city: "Redwood City" },
  { zip: "94062", city: "Redwood City" },
  { zip: "94063", city: "Redwood City" },
  { zip: "94065", city: "Redwood City" },
  { zip: "94002", city: "Belmont" },
  { zip: "94070", city: "San Carlos" },
  { zip: "94010", city: "Burlingame" },
  { zip: "94030", city: "Millbrae" },
  { zip: "94066", city: "San Bruno" },
  { zip: "94080", city: "South San Francisco" },
  { zip: "94014", city: "Daly City" },
  { zip: "94015", city: "Daly City" },
  { zip: "94016", city: "Daly City" },
  { zip: "94017", city: "Daly City" },
  { zip: "94044", city: "Pacifica" },
  { zip: "94019", city: "Half Moon Bay" },
  { zip: "94025", city: "Menlo Park" },
  { zip: "94027", city: "Menlo Park" },
  { zip: "94303", city: "East Palo Alto" },
].map((e) => ({ ...e, county: "San Mateo" as const }));

const SANTA_CLARA: BayAreaZipEntry[] = [
  { zip: "95110", city: "San Jose" },
  { zip: "95111", city: "San Jose" },
  { zip: "95112", city: "San Jose" },
  { zip: "95113", city: "San Jose" },
  { zip: "95116", city: "San Jose" },
  { zip: "95117", city: "San Jose" },
  { zip: "95118", city: "San Jose" },
  { zip: "95119", city: "San Jose" },
  { zip: "95120", city: "San Jose" },
  { zip: "95121", city: "San Jose" },
  { zip: "95122", city: "San Jose" },
  { zip: "95123", city: "San Jose" },
  { zip: "95124", city: "San Jose" },
  { zip: "95125", city: "San Jose" },
  { zip: "95126", city: "San Jose" },
  { zip: "95127", city: "San Jose" },
  { zip: "95128", city: "San Jose" },
  { zip: "95129", city: "San Jose" },
  { zip: "95130", city: "San Jose" },
  { zip: "95131", city: "San Jose" },
  { zip: "95132", city: "San Jose" },
  { zip: "95133", city: "San Jose" },
  { zip: "95134", city: "San Jose" },
  { zip: "95135", city: "San Jose" },
  { zip: "95136", city: "San Jose" },
  { zip: "95138", city: "San Jose" },
  { zip: "95139", city: "San Jose" },
  { zip: "95148", city: "San Jose" },
  { zip: "94085", city: "Sunnyvale" },
  { zip: "94086", city: "Sunnyvale" },
  { zip: "94087", city: "Sunnyvale" },
  { zip: "94089", city: "Sunnyvale" },
  { zip: "95050", city: "Santa Clara" },
  { zip: "95051", city: "Santa Clara" },
  { zip: "95053", city: "Santa Clara" },
  { zip: "95054", city: "Santa Clara" },
  { zip: "94040", city: "Mountain View" },
  { zip: "94041", city: "Mountain View" },
  { zip: "94043", city: "Mountain View" },
  { zip: "94301", city: "Palo Alto" },
  { zip: "94304", city: "Palo Alto" },
  { zip: "94306", city: "Palo Alto" },
  { zip: "95014", city: "Cupertino" },
  { zip: "94022", city: "Los Altos" },
  { zip: "94024", city: "Los Altos" },
  { zip: "95030", city: "Los Gatos" },
  { zip: "95032", city: "Los Gatos" },
  { zip: "95035", city: "Milpitas" },
  { zip: "95020", city: "Gilroy" },
  { zip: "95037", city: "Morgan Hill" },
  { zip: "95008", city: "Campbell" },
  { zip: "95070", city: "Saratoga" },
].map((e) => ({ ...e, county: "Santa Clara" as const }));

const ALAMEDA: BayAreaZipEntry[] = [
  { zip: "94601", city: "Oakland" },
  { zip: "94602", city: "Oakland" },
  { zip: "94603", city: "Oakland" },
  { zip: "94604", city: "Oakland" },
  { zip: "94605", city: "Oakland" },
  { zip: "94606", city: "Oakland" },
  { zip: "94607", city: "Oakland" },
  { zip: "94608", city: "Emeryville" },
  { zip: "94609", city: "Oakland" },
  { zip: "94610", city: "Oakland" },
  { zip: "94611", city: "Oakland" },
  { zip: "94612", city: "Oakland" },
  { zip: "94618", city: "Oakland" },
  { zip: "94619", city: "Oakland" },
  { zip: "94621", city: "Oakland" },
  { zip: "94701", city: "Berkeley" },
  { zip: "94702", city: "Berkeley" },
  { zip: "94703", city: "Berkeley" },
  { zip: "94704", city: "Berkeley" },
  { zip: "94705", city: "Berkeley" },
  { zip: "94707", city: "Berkeley" },
  { zip: "94708", city: "Berkeley" },
  { zip: "94709", city: "Berkeley" },
  { zip: "94710", city: "Berkeley" },
  { zip: "94706", city: "Albany" },
  { zip: "94611", city: "Piedmont" },
  { zip: "94501", city: "Alameda" },
  { zip: "94502", city: "Alameda" },
  { zip: "94536", city: "Fremont" },
  { zip: "94538", city: "Fremont" },
  { zip: "94539", city: "Fremont" },
  { zip: "94555", city: "Fremont" },
  { zip: "94541", city: "Hayward" },
  { zip: "94542", city: "Hayward" },
  { zip: "94544", city: "Hayward" },
  { zip: "94545", city: "Hayward" },
  { zip: "94546", city: "Castro Valley" },
  { zip: "94577", city: "San Leandro" },
  { zip: "94578", city: "San Leandro" },
  { zip: "94579", city: "San Leandro" },
  { zip: "94587", city: "Union City" },
  { zip: "94560", city: "Newark" },
  { zip: "94566", city: "Pleasanton" },
  { zip: "94588", city: "Pleasanton" },
  { zip: "94550", city: "Livermore" },
  { zip: "94551", city: "Livermore" },
  { zip: "94568", city: "Dublin" },
].map((e) => ({ ...e, county: "Alameda" as const }));

const CONTRA_COSTA: BayAreaZipEntry[] = [
  { zip: "94801", city: "Richmond" },
  { zip: "94804", city: "Richmond" },
  { zip: "94805", city: "Richmond" },
  { zip: "94806", city: "San Pablo" },
  { zip: "94530", city: "El Cerrito" },
  { zip: "94518", city: "Concord" },
  { zip: "94519", city: "Concord" },
  { zip: "94520", city: "Concord" },
  { zip: "94521", city: "Concord" },
  { zip: "94595", city: "Walnut Creek" },
  { zip: "94596", city: "Walnut Creek" },
  { zip: "94597", city: "Walnut Creek" },
  { zip: "94598", city: "Walnut Creek" },
  { zip: "94506", city: "Danville" },
  { zip: "94526", city: "Danville" },
  { zip: "94582", city: "San Ramon" },
  { zip: "94583", city: "San Ramon" },
  { zip: "94523", city: "Pleasant Hill" },
  { zip: "94553", city: "Martinez" },
  { zip: "94509", city: "Antioch" },
  { zip: "94531", city: "Antioch" },
  { zip: "94565", city: "Pittsburg" },
  { zip: "94513", city: "Brentwood" },
  { zip: "94563", city: "Orinda" },
  { zip: "94549", city: "Lafayette" },
  { zip: "94556", city: "Moraga" },
  { zip: "94547", city: "Hercules" },
  { zip: "94564", city: "Pinole" },
].map((e) => ({ ...e, county: "Contra Costa" as const }));

const MARIN: BayAreaZipEntry[] = [
  { zip: "94901", city: "San Rafael" },
  { zip: "94903", city: "San Rafael" },
  { zip: "94904", city: "San Rafael" },
  { zip: "94945", city: "Novato" },
  { zip: "94947", city: "Novato" },
  { zip: "94949", city: "Novato" },
  { zip: "94941", city: "Mill Valley" },
  { zip: "94942", city: "Mill Valley" },
  { zip: "94965", city: "Sausalito" },
  { zip: "94966", city: "Sausalito" },
  { zip: "94920", city: "Tiburon" },
  { zip: "94925", city: "Corte Madera" },
  { zip: "94939", city: "Larkspur" },
  { zip: "94930", city: "Fairfax" },
  { zip: "94960", city: "San Anselmo" },
  { zip: "94957", city: "Ross" },
].map((e) => ({ ...e, county: "Marin" as const }));

const NAPA: BayAreaZipEntry[] = [
  { zip: "94558", city: "Napa" },
  { zip: "94559", city: "Napa" },
  { zip: "94503", city: "American Canyon" },
  { zip: "94574", city: "St. Helena" },
  { zip: "94515", city: "Calistoga" },
  { zip: "94599", city: "Yountville" },
].map((e) => ({ ...e, county: "Napa" as const }));

const SOLANO: BayAreaZipEntry[] = [
  { zip: "94589", city: "Vallejo" },
  { zip: "94590", city: "Vallejo" },
  { zip: "94591", city: "Vallejo" },
  { zip: "94592", city: "Vallejo" },
  { zip: "94533", city: "Fairfield" },
  { zip: "94534", city: "Fairfield" },
  { zip: "94535", city: "Fairfield" },
  { zip: "95687", city: "Vacaville" },
  { zip: "95688", city: "Vacaville" },
  { zip: "94510", city: "Benicia" },
  { zip: "94585", city: "Suisun City" },
  { zip: "95620", city: "Dixon" },
  { zip: "94571", city: "Rio Vista" },
].map((e) => ({ ...e, county: "Solano" as const }));

const SONOMA: BayAreaZipEntry[] = [
  { zip: "95401", city: "Santa Rosa" },
  { zip: "95403", city: "Santa Rosa" },
  { zip: "95404", city: "Santa Rosa" },
  { zip: "95405", city: "Santa Rosa" },
  { zip: "95407", city: "Santa Rosa" },
  { zip: "95409", city: "Santa Rosa" },
  { zip: "94952", city: "Petaluma" },
  { zip: "94953", city: "Petaluma" },
  { zip: "94954", city: "Petaluma" },
  { zip: "94928", city: "Rohnert Park" },
  { zip: "94927", city: "Rohnert Park" },
  { zip: "95476", city: "Sonoma" },
  { zip: "95472", city: "Sebastopol" },
  { zip: "95492", city: "Windsor" },
  { zip: "95448", city: "Healdsburg" },
  { zip: "94931", city: "Cotati" },
  { zip: "95425", city: "Cloverdale" },
].map((e) => ({ ...e, county: "Sonoma" as const }));

export const BAY_AREA_ZIPS: BayAreaZipEntry[] = [
  ...SAN_FRANCISCO,
  ...SAN_MATEO,
  ...SANTA_CLARA,
  ...ALAMEDA,
  ...CONTRA_COSTA,
  ...MARIN,
  ...NAPA,
  ...SOLANO,
  ...SONOMA,
];

export const BAY_AREA_ZIP_SET: ReadonlySet<string> = new Set(BAY_AREA_ZIPS.map((e) => e.zip));

export const BAY_AREA_CITIES: string[] = Array.from(new Set(BAY_AREA_ZIPS.map((e) => e.city))).sort();

const BAY_AREA_CITY_SET: ReadonlySet<string> = new Set(BAY_AREA_CITIES.map((c) => c.toLowerCase()));

export function isBayAreaZip(zip: string): boolean {
  return BAY_AREA_ZIP_SET.has(zip.trim().slice(0, 5));
}

export function isBayAreaCity(city: string): boolean {
  return BAY_AREA_CITY_SET.has(city.trim().toLowerCase());
}
