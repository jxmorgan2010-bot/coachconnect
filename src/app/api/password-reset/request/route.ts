import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/validation";
import { requestPasswordReset, resetLink } from "@/lib/passwordReset";
import { clientIp } from "@/lib/minorConsent";
import { later, sendEmail, withRetry } from "@/lib/email";
import { passwordResetEmail } from "@/lib/emails";

/**
 * "Forgot password?" Always answers the same way, and does the lookup, rate limiting and
 * email after the response, so neither the answer nor its timing says whether the email has
 * an account. See src/lib/passwordReset.ts.
 */
export async function POST(req: Request) {
  const parsed = forgotPasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const ip = clientIp(req);
  later(async () => {
    const outcome = await requestPasswordReset({ email: parsed.data.email, ip });
    if (outcome.status === "SENT") {
      // An admin retry makes a new link (src/lib/emailRetry.ts): only this one's hash is stored.
      await sendEmail(
        withRetry(passwordResetEmail({ to: outcome.user.email, name: outcome.user.name, link: resetLink(outcome.token) }), {
          kind: "PASSWORD_RESET",
          ref: outcome.user.id,
        }),
      );
    } else if (outcome.status !== "NO_ACCOUNT") {
      console.log(`[password reset] request not sent: ${outcome.status}`);
    }
  }, "password reset");

  return NextResponse.json({ ok: true });
}
