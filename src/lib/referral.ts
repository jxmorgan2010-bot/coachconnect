import { randomBytes } from "crypto";

export const REFERRAL_BONUS_CENTS = 1000; // $10, per the user's stated amount

export function generateReferralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
