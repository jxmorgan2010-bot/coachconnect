import { connection } from "next/server";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { formatCalendarDate, todayInPacific } from "@/lib/age";
import CoachSignupForm from "./CoachSignupForm";

// The flag is server-only, so it's read here and passed down as a plain boolean.
export default async function CoachSignupPage() {
  await connection(); // render per request: "today" mustn't be frozen at build time
  return <CoachSignupForm minorCoachesEnabled={ENABLE_MINOR_COACHES} todayPacific={formatCalendarDate(todayInPacific())} />;
}
