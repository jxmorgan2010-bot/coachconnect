import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import CoachSignupForm from "./CoachSignupForm";

// The flag is server-only, so it's read here and passed down as a plain boolean.
export default function CoachSignupPage() {
  return <CoachSignupForm minorCoachesEnabled={ENABLE_MINOR_COACHES} />;
}
