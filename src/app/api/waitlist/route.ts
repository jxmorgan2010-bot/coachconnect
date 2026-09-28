import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { waitlistSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { email, zip, role } = parsed.data;

  await prisma.waitlistEntry.create({
    data: {
      email: email.toLowerCase().trim(),
      zip,
      role,
    },
  });

  return NextResponse.json({ ok: true });
}
