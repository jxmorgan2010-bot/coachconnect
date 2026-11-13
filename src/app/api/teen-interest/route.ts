import { NextResponse } from "next/server";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { teenInterestSchema } from "@/lib/validation";
import { coachAgeBand, describeCalendarDate, todayInPacific } from "@/lib/age";
import { evaluateCoachAgeEligibility } from "@/lib/coach";
import { isTeenInterestAge, turns18OnFor } from "@/lib/teenInterest";
import { joinTeenInterestList } from "@/lib/teenInterestStore";
import { teenInterestConfirmationEmail } from "@/lib/emails";
import { queueEmail } from "@/lib/email";
import { siteLink } from "@/lib/siteUrl";

/**
 * Teen interest list (src/lib/teenInterest.ts). No account, no password. The date of birth is
 * checked here and dropped: only the date they turn 18 is kept.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = teenInterestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { dateOfBirth, ...fields } = parsed.data;

  // With the Minor Coach tier on, 16–17-year-olds use the real signup and its consent flow.
  if (ENABLE_MINOR_COACHES) {
    return NextResponse.json(
      { error: "Coaches under 18 can sign up now. Go back to coach signup.", code: "MINOR_COACHES_OPEN" },
      { status: 409 },
    );
  }

  const today = todayInPacific();
  if (!isTeenInterestAge(dateOfBirth, today, ENABLE_MINOR_COACHES)) {
    if (coachAgeBand(dateOfBirth, today).band === "ADULT") {
      return NextResponse.json(
        { error: "You're 18 or older, so you can sign up as a coach now.", code: "ADULT" },
        { status: 422 },
      );
    }
    // Under the minimum age: the same rejection coach signup gives. Nothing is saved.
    const eligibility = evaluateCoachAgeEligibility(dateOfBirth, { today });
    return NextResponse.json(
      { error: eligibility.ok ? "You can't join the interest list." : eligibility.reason, code: "TOO_YOUNG" },
      { status: 422 },
    );
  }

  const turns18On = turns18OnFor(dateOfBirth);
  const { removeToken } = await joinTeenInterestList({ ...fields, turns18On });
  if (removeToken) {
    queueEmail(
      teenInterestConfirmationEmail({
        to: fields.email.toLowerCase().trim(),
        firstName: fields.firstName,
        turns18On: describeCalendarDate(turns18On),
        removeLink: siteLink(`/teen-interest/remove/${removeToken}`),
      }),
    );
  }

  // The same answer whether or not an entry already existed, so the form can't be used to check
  // whether an address is on the list.
  return NextResponse.json({ ok: true });
}
