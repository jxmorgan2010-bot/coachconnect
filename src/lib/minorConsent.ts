import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { cancelPaymentIntent } from "@/lib/payment";
import { sendMockEmail } from "@/lib/mockEmail";
import { MINOR_CONSENT_TEXT_VERSION, REQUIRED_ACKNOWLEDGMENT_KEYS } from "@/lib/legal/minorConsentText";
import type { MinorConsent } from "@/generated/prisma/client";

/**
 * Parent/guardian consent for Minor Coaches (see the MinorConsent model).
 *
 * - The teen names a parent/guardian; a single-use link valid for CONSENT_LINK_TTL_DAYS is
 *   "emailed" to them (mock email: console only). Only a SHA-256 hash of the token is
 *   stored, so a link can be shown exactly once — when it's created. The teen never sees
 *   it, so they can't sign on their parent's behalf.
 * - Requesting a new link supersedes the pending one.
 * - Signing records the signature and issues a revoke link that never expires.
 * - Revoking unpublishes the profile (consent cache cleared, ID approval back to PENDING)
 *   and cancels the coach's upcoming sessions, releasing card holds.
 *
 * CoachProfile.minorGuardian* is a cache of the consent in effect, written in the same
 * transaction as the MinorConsent row it mirrors. Decisions that matter (admin approval,
 * uploads) read MinorConsent directly.
 */

export const CONSENT_LINK_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const REVOKED_CANCEL_REASON = "Coach's parent/guardian withdrew consent";

export class MinorConsentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

/** Client IP as Vercel reports it: the first entry of x-forwarded-for (Vercel overwrites this header). */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

export function consentLink(origin: string, token: string) {
  return `${origin}/minor-consent/${token}`;
}

export function revokeLink(origin: string, revokeToken: string) {
  return `${origin}/minor-consent/revoke/${revokeToken}`;
}

export type ConsentRowStatus = "PENDING" | "EXPIRED" | "SUPERSEDED" | "COMPLETED" | "REVOKED";
export type CoachConsentStatus = "NONE" | Exclude<ConsentRowStatus, "SUPERSEDED">;

type StatusFields = Pick<MinorConsent, "supersededAt" | "completedAt" | "revokedAt" | "expiresAt">;

export function consentRowStatus(row: StatusFields, now: Date = new Date()): ConsentRowStatus {
  if (row.revokedAt) return "REVOKED";
  if (row.completedAt) return "COMPLETED";
  if (row.supersededAt) return "SUPERSEDED";
  if (row.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

/** A coach's consent status is that of their newest link that hasn't been replaced. */
export function coachConsentStatus<T extends StatusFields & { createdAt: Date }>(
  rows: T[],
  now: Date = new Date(),
): { status: CoachConsentStatus; current: T | null } {
  const current = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).find((r) => !r.supersededAt) ?? null;
  return { status: current ? (consentRowStatus(current, now) as CoachConsentStatus) : "NONE", current };
}

/** The completed, unrevoked consent for a coach, if any. */
export function getActiveConsent(coachProfileId: string) {
  return prisma.minorConsent.findFirst({
    where: { coachProfileId, completedAt: { not: null }, revokedAt: null },
    orderBy: { completedAt: "desc" },
  });
}

/**
 * Creates a new consent link for a minor coach, superseding any pending one. Returns the
 * raw token — the only time it exists outside the link itself.
 */
export async function createConsentRequest({
  coachProfileId,
  guardianName,
  guardianEmail,
  now = new Date(),
}: {
  coachProfileId: string;
  guardianName: string;
  guardianEmail: string;
  now?: Date;
}) {
  const token = generateToken();
  const consent = await prisma.$transaction(async (tx) => {
    const profile = await tx.coachProfile.findUnique({ where: { id: coachProfileId }, include: { user: true } });
    if (!profile || !profile.isMinorCoach) {
      throw new MinorConsentError("Not applicable to this account.", 400);
    }
    if (sameEmail(guardianEmail, profile.user.email)) {
      throw new MinorConsentError("Your parent or guardian's email has to be different from your own email.", 400);
    }
    const active = await tx.minorConsent.findFirst({
      where: { coachProfileId, completedAt: { not: null }, revokedAt: null },
    });
    if (active) {
      throw new MinorConsentError("Your parent or guardian has already signed.", 409);
    }

    await tx.minorConsent.updateMany({
      where: { coachProfileId, completedAt: null, supersededAt: null, revokedAt: null },
      data: { supersededAt: now },
    });
    return tx.minorConsent.create({
      data: {
        coachProfileId,
        guardianName: guardianName.trim(),
        guardianEmail: guardianEmail.trim().toLowerCase(),
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + CONSENT_LINK_TTL_DAYS * DAY_MS),
        createdAt: now,
      },
    });
  });
  return { consent, token };
}

/** Admin "send manually": a fresh link to the same parent/guardian as the newest request. */
export async function reissueConsentLink(coachProfileId: string, now: Date = new Date()) {
  const latest = await prisma.minorConsent.findFirst({ where: { coachProfileId }, orderBy: { createdAt: "desc" } });
  if (!latest) {
    throw new MinorConsentError("The coach hasn't named a parent or guardian yet.", 409);
  }
  return createConsentRequest({ coachProfileId, guardianName: latest.guardianName, guardianEmail: latest.guardianEmail, now });
}

export type ConsentTokenState = "VALID" | "NOT_FOUND" | "EXPIRED" | "SUPERSEDED" | "USED";

/** Looks up a consent link. Revoked and completed both read as USED: the link was single-use. */
export async function lookupConsentToken(token: string, now: Date = new Date()) {
  const consent = await prisma.minorConsent.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { coachProfile: { include: { user: true } } },
  });
  if (!consent || !consent.coachProfile.isMinorCoach) return { state: "NOT_FOUND" as const, consent: null };
  const status = consentRowStatus(consent, now);
  const state: ConsentTokenState =
    status === "PENDING" ? "VALID" : status === "COMPLETED" || status === "REVOKED" ? "USED" : status;
  return { state, consent };
}

const TOKEN_STATE_ERRORS: Record<Exclude<ConsentTokenState, "VALID">, [string, number]> = {
  NOT_FOUND: ["This consent link doesn't work.", 404],
  EXPIRED: ["This consent link has expired. Ask the coach to send you a new one.", 410],
  SUPERSEDED: ["A newer consent link was sent, so this one no longer works. Use the most recent link.", 410],
  USED: ["This consent link has already been used.", 409],
};

export type ConsentSignatureInput = {
  consentTextVersion: string;
  acknowledgedKeys: string[];
  signerLegalName: string;
  signerRelationship: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  confirmedAdult: true;
  typedSignature: string;
};

/**
 * Records the parent/guardian's signature. Single use: the write only succeeds while the
 * row is still pending, so a reused, expired or superseded link fails even if two
 * submissions race. Returns the raw revoke token for the confirmation page and email.
 */
export async function completeConsent(
  token: string,
  input: ConsentSignatureInput,
  meta: { ip: string | null; userAgent: string | null },
  now: Date = new Date(),
) {
  if (input.consentTextVersion !== MINOR_CONSENT_TEXT_VERSION) {
    throw new MinorConsentError("This consent form was updated while you had it open. Reload the page and review it again.", 409);
  }
  const ticked = new Set(input.acknowledgedKeys);
  if (!REQUIRED_ACKNOWLEDGMENT_KEYS.every((k) => ticked.has(k))) {
    throw new MinorConsentError("Tick each statement to confirm you've read and agree to it.", 400);
  }
  if (!sameName(input.typedSignature, input.signerLegalName)) {
    throw new MinorConsentError("Your typed signature has to match the full legal name you entered.", 400);
  }

  const { state, consent } = await lookupConsentToken(token, now);
  if (state !== "VALID" || !consent) {
    const [message, status] = TOKEN_STATE_ERRORS[state as Exclude<ConsentTokenState, "VALID">];
    throw new MinorConsentError(message, status);
  }

  const revokeToken = generateToken();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.minorConsent.updateMany({
      where: { id: consent.id, completedAt: null, supersededAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: {
        completedAt: now,
        consentTextVersion: MINOR_CONSENT_TEXT_VERSION,
        acknowledgedKeys: JSON.stringify(REQUIRED_ACKNOWLEDGMENT_KEYS.filter((k) => ticked.has(k))),
        signerLegalName: input.signerLegalName.trim(),
        signerRelationship: input.signerRelationship,
        typedSignature: input.typedSignature.trim(),
        confirmedAdult: true,
        emergencyContactName: input.emergencyContactName.trim(),
        emergencyContactPhone: input.emergencyContactPhone.trim(),
        signerIp: meta.ip,
        signerUserAgent: meta.userAgent?.slice(0, 500) ?? null,
        revokeTokenHash: hashToken(revokeToken),
      },
    });
    if (count !== 1) throw new MinorConsentError(...TOKEN_STATE_ERRORS.USED);

    await tx.coachProfile.update({
      where: { id: consent.coachProfileId },
      data: {
        minorGuardianName: input.signerLegalName.trim(),
        minorGuardianRelationship: input.signerRelationship,
        minorGuardianEmail: consent.guardianEmail,
        minorGuardianConsentedAt: now,
      },
    });
  });

  return { revokeToken, consent };
}

/** Admin "send manually": replaces the revoke link of a signed, unrevoked consent. */
export async function reissueRevokeLink(coachProfileId: string) {
  const active = await getActiveConsent(coachProfileId);
  if (!active) throw new MinorConsentError("There's no signed consent to withdraw.", 409);
  const revokeToken = generateToken();
  await prisma.minorConsent.update({ where: { id: active.id }, data: { revokeTokenHash: hashToken(revokeToken) } });
  return { revokeToken, consent: active };
}

export function lookupRevokeToken(revokeToken: string) {
  return prisma.minorConsent.findUnique({
    where: { revokeTokenHash: hashToken(revokeToken) },
    include: { coachProfile: { include: { user: true } } },
  });
}

export type RevocationResult = {
  alreadyRevoked: boolean;
  coachProfileId: string;
  cancelledBookingIds: string[];
  /** Cancelled bookings whose card hold couldn't be voided — shown to admins for follow-up. */
  holdsNotVoided: string[];
};

/**
 * Withdraws consent. Works whether or not the Minor Coach flag is on — a parent must
 * always be able to withdraw. The profile is unpublished in the same transaction that
 * records the revocation; upcoming sessions are cancelled right after (see
 * cancelUpcomingSessionsForCoach). `voidHold` is injectable for tests.
 */
export async function revokeConsent(
  revokeToken: string,
  meta: { ip: string | null; userAgent: string | null },
  { now = new Date(), voidHold = cancelPaymentIntent }: { now?: Date; voidHold?: (id: string | null) => Promise<unknown> } = {},
): Promise<RevocationResult> {
  const consent = await lookupRevokeToken(revokeToken);
  if (!consent || !consent.completedAt) throw new MinorConsentError("This withdrawal link doesn't work.", 404);
  const coachProfileId = consent.coachProfileId;

  const revokedNow = await prisma.$transaction(async (tx) => {
    const { count } = await tx.minorConsent.updateMany({
      where: { id: consent.id, revokedAt: null },
      data: { revokedAt: now, revokeIp: meta.ip, revokeUserAgent: meta.userAgent?.slice(0, 500) ?? null },
    });
    if (count !== 1) return false;
    await tx.coachProfile.update({
      where: { id: coachProfileId },
      data: {
        minorGuardianName: null,
        minorGuardianRelationship: null,
        minorGuardianEmail: null,
        minorGuardianConsentedAt: null,
        // Back to the review queue: if consent is ever given again, an admin approves again.
        idVerificationStatus: "PENDING",
      },
    });
    return true;
  });

  if (!revokedNow) return { alreadyRevoked: true, coachProfileId, cancelledBookingIds: [], holdsNotVoided: [] };

  const { cancelledBookingIds, holdsNotVoided } = await cancelUpcomingSessionsForCoach(coachProfileId, { now, voidHold });

  const coach = consent.coachProfile.user;
  sendMockEmail(
    consent.guardianEmail,
    "Consent withdrawn",
    `You've withdrawn consent for ${coach.name} to coach on CoachConnect. Their profile is hidden from families and ${cancelledBookingIds.length} upcoming session(s) were cancelled.`,
  );
  sendMockEmail(
    coach.email,
    "Your coach profile is paused",
    `Your parent or guardian withdrew their consent, so your profile is hidden from families and your upcoming sessions were cancelled. If they change their mind, you can send them a new consent request from your onboarding page.`,
  );

  return { alreadyRevoked: false, coachProfileId, cancelledBookingIds, holdsNotVoided };
}

/**
 * Cancels a coach's sessions that haven't started yet. Sessions already under way or over
 * are left to the normal complete / no-show / auto-release flow.
 *
 * - Card-hold bookings: cancelled first, then the hold is voided. If voiding fails the
 *   booking stays CANCELLED with paymentStatus AUTHORIZED, which the admin page lists for
 *   follow-up; the auto-release sweep only looks at CONFIRMED bookings, so it's never captured.
 *   Referral credit spent on the booking goes back to the parent's wallet.
 * - Package bookings: the session goes back into the package, as with a no-show.
 */
export async function cancelUpcomingSessionsForCoach(
  coachProfileId: string,
  { now = new Date(), voidHold = cancelPaymentIntent }: { now?: Date; voidHold?: (id: string | null) => Promise<unknown> } = {},
) {
  const upcoming = await prisma.booking.findMany({
    where: { coachProfileId, status: { in: ["CONFIRMED", "PENDING_CONSENT"] }, scheduledAt: { gt: now } },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
  });

  const cancelledBookingIds: string[] = [];
  const holdsNotVoided: string[] = [];

  for (const b of upcoming) {
    const cancelled = await prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id: b.id, status: b.status },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: REVOKED_CANCEL_REASON,
          ...(b.packageId ? { paymentStatus: "REFUNDED" as const } : {}),
        },
      });
      if (count !== 1) return false;
      if (b.packageId) {
        await tx.sessionPackage.update({
          where: { id: b.packageId },
          data: { sessionsUsed: { decrement: 1 }, sessionsRefunded: { increment: 1 }, status: "ACTIVE" },
        });
      } else if (b.discountCents > 0) {
        await tx.parentProfile.update({
          where: { id: b.parentProfileId },
          data: { creditCents: { increment: b.discountCents } },
        });
      }
      return true;
    });
    if (!cancelled) continue;
    cancelledBookingIds.push(b.id);

    let holdReleased = true;
    if (!b.packageId) {
      try {
        await voidHold(b.stripePaymentIntentId);
        await prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: "CANCELLED" } });
      } catch (err) {
        holdReleased = false;
        holdsNotVoided.push(b.id);
        console.error(`Couldn't void the card hold for booking ${b.id} after consent was withdrawn`, err);
      }
    }

    const when = b.scheduledAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" });
    const money = b.packageId
      ? "The session has been returned to your package."
      : holdReleased
        ? "Your card hold has been released and you won't be charged."
        : "You won't be charged; our team is releasing your card hold.";
    sendMockEmail(
      b.parentProfile.user.email,
      "Session cancelled",
      `Your session with ${b.coachProfile.user.name} on ${when} has been cancelled because the coach is no longer available. ${money}`,
    );
  }

  return { cancelledBookingIds, holdsNotVoided };
}

/**
 * The only way an admin sets a coach's ID verification status. Approving a minor coach
 * requires the Minor Coach tier to be on and a completed, unrevoked consent — checked
 * here on the server inside the same transaction as the write, so hiding the button is
 * never the only guard.
 */
export async function setIdVerificationStatus(
  coachProfileId: string,
  status: "APPROVED" | "REJECTED",
  { minorCoachesEnabled }: { minorCoachesEnabled: boolean },
) {
  await prisma.$transaction(async (tx) => {
    const profile = await tx.coachProfile.findUnique({ where: { id: coachProfileId } });
    if (!profile) throw new MinorConsentError("Coach not found.", 404);
    if (status === "APPROVED" && profile.isMinorCoach) {
      if (!minorCoachesEnabled) {
        throw new MinorConsentError("This coach is under 18, and the Minor Coach tier is off, so they can't be approved.", 403);
      }
      const active = await tx.minorConsent.findFirst({
        where: { coachProfileId, completedAt: { not: null }, revokedAt: null },
      });
      if (!active) {
        throw new MinorConsentError(
          "This coach is under 18. They can't be approved until their parent or guardian has completed consent (and hasn't withdrawn it).",
          409,
        );
      }
    }
    await tx.coachProfile.update({ where: { id: coachProfileId }, data: { idVerificationStatus: status } });
  });
}

/** Minors can't upload their school ID, photos or videos until a parent has consented to that processing. */
export async function minorMediaUploadBlockedMessage(profile: { id: string; isMinorCoach: boolean }): Promise<string | null> {
  if (!profile.isMinorCoach) return null;
  const active = await getActiveConsent(profile.id);
  return active
    ? null
    : "Your parent or guardian needs to sign the consent form before you can upload your school ID, photos or videos.";
}
