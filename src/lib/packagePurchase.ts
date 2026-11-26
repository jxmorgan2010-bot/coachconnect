import { prisma } from "@/lib/prisma";
import { Prisma, type Sport } from "@/generated/prisma/client";
import { calculateBundlePricing, BUNDLE_DISCOUNT_PERCENT } from "@/lib/bundles";
import { SPORTS } from "@/lib/sports";
import { isPackageIntent, type DeliveryResult, type PackageIntent } from "@/lib/packageIntent";

/**
 * Turning a paid package PaymentIntent into a SessionPackage. Two callers race to do it: the
 * browser right after paying (POST /api/packages) and Stripe's webhook (POST /api/stripe/webhook),
 * which is there for when the browser never comes back. Whoever is second gets the package the
 * first one made: SessionPackage.stripePaymentIntentId is unique.
 */

const wholeNumber = (value: string | undefined): number | null => (value && /^\d+$/.test(value) ? Number(value) : null);

export async function deliverPackage(intent: PackageIntent): Promise<DeliveryResult> {
  const m = intent.metadata;
  if (!m || !isPackageIntent(m)) return { status: "NOT_A_PACKAGE" };

  const existing = await prisma.sessionPackage.findUnique({ where: { stripePaymentIntentId: intent.id }, select: { id: true } });
  if (existing) return { status: "EXISTING", packageId: existing.id };

  if (intent.status !== "succeeded") return { status: "NOT_PAID" };
  if (!intent.latest_charge || typeof intent.latest_charge === "string") {
    throw new Error(`PaymentIntent ${intent.id} was loaded without its charge.`);
  }
  if (intent.latest_charge.amount_refunded >= intent.amount) return { status: "REFUNDED" };

  const durationMinutes = wholeNumber(m.durationMinutes);
  if (!durationMinutes || !(SPORTS as readonly string[]).includes(m.sport)) {
    return { status: "UNDELIVERABLE", reason: "its sport or length is missing" };
  }
  const [parent, coach] = await Promise.all([
    prisma.parentProfile.findUnique({ where: { id: m.parentProfileId }, select: { id: true } }),
    prisma.coachProfile.findUnique({ where: { id: m.coachProfileId }, select: { id: true, hourlyRateCents: true } }),
  ]);
  if (!parent) return { status: "UNDELIVERABLE", reason: "the parent's account is gone" };
  if (!coach) return { status: "UNDELIVERABLE", reason: "the coach's account is gone" };

  let totalSessions = wholeNumber(m.sessionCount);
  let pricePerSessionCents = wholeNumber(m.pricePerSessionCents);
  let discountPercent = wholeNumber(m.discountPercent);
  if (!totalSessions || !pricePerSessionCents || discountPercent === null) {
    // Paid for before the price was recorded: only deliverable if the coach's rate still matches.
    const now = coach.hourlyRateCents ? calculateBundlePricing(coach.hourlyRateCents, durationMinutes) : null;
    if (!now || now.totalChargedCents !== intent.amount) {
      return { status: "UNDELIVERABLE", reason: "the coach's price changed during the purchase" };
    }
    totalSessions = now.sessionCount;
    pricePerSessionCents = now.pricePerSessionCents;
    discountPercent = BUNDLE_DISCOUNT_PERCENT;
  }

  try {
    const pkg = await prisma.sessionPackage.create({
      data: {
        parentProfileId: parent.id,
        coachProfileId: coach.id,
        sport: m.sport as Sport,
        durationMinutes,
        totalSessions,
        pricePerSessionCents,
        discountPercent,
        totalChargedCents: intent.amount,
        stripePaymentIntentId: intent.id,
      },
    });
    return { status: "CREATED", packageId: pkg.id };
  } catch (err) {
    // The other caller made it between the check above and this write.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const made = await prisma.sessionPackage.findUnique({ where: { stripePaymentIntentId: intent.id }, select: { id: true } });
      if (made) return { status: "EXISTING", packageId: made.id };
    }
    throw err;
  }
}
