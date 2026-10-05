import { Suspense } from "react";
import { REFERRAL_BONUS_CENTS } from "@/lib/referral";
import ParentSignupForm from "./ParentSignupForm";

export default function ParentSignupPage() {
  return (
    <Suspense>
      <ParentSignupForm referralBonusCents={REFERRAL_BONUS_CENTS} />
    </Suspense>
  );
}
