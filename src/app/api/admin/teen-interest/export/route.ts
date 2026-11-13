import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { todayInPacific, formatCalendarDate } from "@/lib/age";
import { teenInterestCsv } from "@/lib/teenInterest";

/** CSV of the teen interest list, oldest first. Admins only; never cached. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const rows = await prisma.teenInterestEntry.findMany({ orderBy: { createdAt: "asc" } });
  const today = todayInPacific();
  // The byte-order mark makes Excel read the file as UTF-8 (accented names).
  return new NextResponse(`﻿${teenInterestCsv(rows, today)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="teen-interest-list-${formatCalendarDate(today)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
