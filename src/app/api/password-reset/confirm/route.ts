import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/validation";
import { resetPassword } from "@/lib/passwordReset";
import { queueEmail } from "@/lib/email";
import { passwordChangedEmail } from "@/lib/emails";

/** Sets a new password from a reset link and signs the account out everywhere. */
export async function POST(req: Request) {
  const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const result = await resetPassword({ token: parsed.data.token, newPassword: parsed.data.password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: "LINK_DEAD" }, { status: 400 });
  }

  queueEmail(passwordChangedEmail({ to: result.user.email, name: result.user.name }));
  return NextResponse.json({ ok: true });
}
