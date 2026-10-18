import { randomBytes } from "crypto";

// Given to both parents when a new parent signs up with a referral code. It is stored on each
// parent profile as it is earned, so changing it never alters credit already handed out.
export const REFERRAL_BONUS_CENTS = 500; // $5

export function generateReferralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
