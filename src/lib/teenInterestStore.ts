import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { calendarDateToStoredDate, type CalendarDate } from "@/lib/age";
import { CONFIRMATION_RESEND_MS, formatSports } from "@/lib/teenInterest";
import type { Sport } from "@/generated/prisma/client";

/** Database side of the teen interest list (rules in src/lib/teenInterest.ts). */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Only this hash is stored; the token itself exists only in the emailed link. */
export function hashRemoveToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newRemoveToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashRemoveToken(token) };
}

export function isRemoveToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export type TeenInterestInput = {
  firstName: string;
  email: string;
  sports: Sport[];
  school: string;
  gradYear: number;
  parentEmail?: string;
  turns18On: CalendarDate;
};

/**
 * Adds the entry, or updates the one with this email. Returns the removal token to email, or null
 * when a confirmation already went to this address in the last 24 hours (a repeat signup then
 * keeps the earlier link working and sends nothing). A new token replaces the old link.
 */
export async function joinTeenInterestList(input: TeenInterestInput, now = new Date(), retried = false): Promise<{ removeToken: string | null }> {
  const email = input.email.toLowerCase().trim();
  const fields = {
    firstName: input.firstName,
    sports: formatSports(input.sports),
    school: input.school,
    gradYear: input.gradYear,
    parentEmail: input.parentEmail?.toLowerCase().trim() ?? null,
    turns18On: calendarDateToStoredDate(input.turns18On),
  };

  const existing = await prisma.teenInterestEntry.findUnique({ where: { email }, select: { id: true, confirmationSentAt: true } });
  if (existing) {
    const recentlySent =
      existing.confirmationSentAt && now.getTime() - existing.confirmationSentAt.getTime() < CONFIRMATION_RESEND_MS;
    if (recentlySent) {
      await prisma.teenInterestEntry.update({ where: { id: existing.id }, data: fields });
      return { removeToken: null };
    }
    const { token, tokenHash } = newRemoveToken();
    await prisma.teenInterestEntry.update({
      where: { id: existing.id },
      data: { ...fields, removeTokenHash: tokenHash, confirmationSentAt: now },
    });
    return { removeToken: token };
  }

  const { token, tokenHash } = newRemoveToken();
  try {
    await prisma.teenInterestEntry.create({
      data: { ...fields, email, removeTokenHash: tokenHash, confirmationSentAt: now },
    });
  } catch (err) {
    // Two submissions at once: the other one created it, so take the update path.
    if ((err as { code?: string })?.code === "P2002" && !retried) return joinTeenInterestList(input, now, true);
    throw err;
  }
  return { removeToken: token };
}

/** The entry a removal link points at (just the email, to show on the confirm page), or null. */
export async function findByRemoveToken(token: string): Promise<{ email: string } | null> {
  if (!isRemoveToken(token)) return null;
  return prisma.teenInterestEntry.findUnique({ where: { removeTokenHash: hashRemoveToken(token) }, select: { email: true } });
}

/** Deletes the entry. False if the link is unknown (already removed, or replaced by a newer email). */
export async function removeByToken(token: string): Promise<boolean> {
  if (!isRemoveToken(token)) return false;
  const { count } = await prisma.teenInterestEntry.deleteMany({ where: { removeTokenHash: hashRemoveToken(token) } });
  return count > 0;
}

/** Ticking an entry that's already ticked keeps the first date. False if the entry is gone. */
export async function setContacted(id: string, contacted: boolean, now = new Date()): Promise<boolean> {
  await prisma.teenInterestEntry.updateMany({
    where: contacted ? { id, contactedAt: null } : { id },
    data: { contactedAt: contacted ? now : null },
  });
  return (await prisma.teenInterestEntry.count({ where: { id } })) > 0;
}
