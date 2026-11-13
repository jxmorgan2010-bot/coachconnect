import { NextResponse } from "next/server";
import { removeByToken } from "@/lib/teenInterestStore";

/** Deletes a teen interest entry, from the link in its confirmation email. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!(await removeByToken(token))) {
    return NextResponse.json({ error: "This link doesn't work anymore. The entry may already be removed." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
