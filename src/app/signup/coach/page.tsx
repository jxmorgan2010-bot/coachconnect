import { connection } from "next/server";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { EXPERIENCED_COACHES_ENABLED } from "@/lib/features";
import { formatCalendarDate, todayInPacific } from "@/lib/age";
import CoachSignupForm from "./CoachSignupForm";

// The flags are read here and passed down as plain booleans (flags.ts is server-only).
export default async function CoachSignupPage() {
  await connection(); // render per request: "today" mustn't be frozen at build time
  return (
    <CoachSignupForm
      minorCoachesEnabled={ENABLE_MINOR_COACHES}
      experiencedCoachesEnabled={EXPERIENCED_COACHES_ENABLED}
      todayPacific={formatCalendarDate(todayInPacific())}
    />
  );
}
