import { createHash, createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Forgot-password links.
 *
 * - The token is 32 random bytes. Only its SHA-256 hash is stored; the raw token exists only in
 *   the emailed link.
 * - A link works once and expires RESET_TOKEN_TTL_MS after it's made. Asking again cancels
 *   any earlier unused link.
 * - Rate limits, counted in the database (Vercel functions share no memory): RESET_LIMIT_PER_ACCOUNT
 *   links per account and RESET_LIMIT_PER_IP requests per IP, per hour. IPs are stored only as an
 *   HMAC keyed from NEXTAUTH_SECRET.
 * - The request route answers the same way whatever happens here, so it never reveals whether
 *   an account exists.
 * - A successful reset bumps User.sessionVersion, which signs the user out everywhere
 *   (see the jwt callback in src/lib/auth.ts).
 */

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const RESET_LIMIT_PER_ACCOUNT = 3;
export const RESET_LIMIT_PER_IP = 10;
const WINDOW_MS = 60 * 60 * 1000;
// Rate-limit rows older than this are no longer needed and are pruned as new ones arrive.
const REQUEST_ROW_TTL_MS = 24 * 60 * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function resetLink(token: string): string {
  return `${siteUrl()}/reset-password/${token}`;
}

function ipKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set, so reset requests can't be rate-limited.");
  return createHmac("sha256", secret).update("assistcoaching:reset-ip:v1").digest();
}

export function hashIp(ip: string | null): string {
  return createHmac("sha256", ipKey()).update(ip ?? "unknown").digest("hex");
}

export type ResetRequestOutcome =
  | { status: "SENT"; token: string; user: { email: string; name: string } }
  | { status: "NO_ACCOUNT" | "ACCOUNT_LIMIT" | "IP_LIMIT" };

/** Records the request and, if allowed, makes a new link. The caller emails it; never tells the visitor which outcome happened. */
export async function requestPasswordReset({
  email,
  ip,
  now = new Date(),
}: {
  email: string;
  ip: string | null;
  now?: Date;
}): Promise<ResetRequestOutcome> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const ipHash = hashIp(ip);

  const fromIp = await prisma.passwordResetRequest.count({ where: { ipHash, createdAt: { gt: since } } });
  if (fromIp >= RESET_LIMIT_PER_IP) return { status: "IP_LIMIT" };
  await prisma.passwordResetRequest.create({ data: { ipHash, createdAt: now } });
  await prisma.passwordResetRequest.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - REQUEST_ROW_TTL_MS) } } });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return { status: "NO_ACCOUNT" };

  const forAccount = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: since } } });
  if (forAccount >= RESET_LIMIT_PER_ACCOUNT) return { status: "ACCOUNT_LIMIT" };

  const { token, tokenHash } = newResetToken();
  await prisma.$transaction([
    // Only the newest link works.
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS), createdAt: now },
    }),
  ]);
  return { status: "SENT", token, user: { email: user.email, name: user.name } };
}

/** Whether a link can still be used, for the reset page. Doesn't say why not. */
export async function isResetTokenUsable(token: string, now = new Date()): Promise<boolean> {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } });
  return !!row && !row.usedAt && row.expiresAt > now;
}

export const RESET_LINK_DEAD = "This link has expired or was already used. Ask for a new one.";

/**
 * Sets the new password, uses up the link (and any other open link for the account) and bumps
 * sessionVersion so every existing session ends. The claim on the token is a guarded update,
 * so the same link can't be used twice even by two requests at once.
 */
export async function resetPassword({
  token,
  newPassword,
  now = new Date(),
}: {
  token: string;
  newPassword: string;
  now?: Date;
}): Promise<{ ok: true; user: { email: string; name: string } } | { ok: false; error: string }> {
  const tokenHash = hashResetToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row) return null;
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) return null;
    await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
    return tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { email: true, name: true },
    });
  });
  if (!user) return { ok: false, error: RESET_LINK_DEAD };
  return { ok: true, user };
}
