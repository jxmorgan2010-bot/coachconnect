"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import AuthLayout from "@/components/AuthLayout";
import { CONTACT_RULE_TEXT } from "@/lib/contactRule";
import { IconUsers } from "@/components/icons";
import { inputClass, labelClass, primaryButtonClass, errorClass } from "@/lib/ui";
import { formatCents } from "@/lib/money";

// referralBonusCents comes from the server page — lib/referral imports node:crypto, so it stays out of the client bundle.
export default function ParentSignupForm({ referralBonusCents }: { referralBonusCents: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") ?? "");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!ageConfirmed) {
      setError("Please confirm you are the parent/guardian creating this account.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register/parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          phone: phone || undefined,
          referralCode: referralCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }

      const signInRes = await signIn("credentials", { redirect: false, email, password });
      if (signInRes?.error) {
        router.push("/login");
        return;
      }
      router.push("/coaches");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      panelColor="pitch"
      panelIcon={<IconUsers className="h-7 w-7" />}
      panelTitle="Book real coaching time, safely."
      panelPoints={[
        "Only parent accounts can book or pay — kids can't book themselves",
        "A person reviews every coach's ID before their profile goes live",
        "You pick the park, gym, or rec center — not the coach",
      ]}
    >
      <h1 className="text-display-lg mb-2 font-display text-ink">Create a parent account</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        For parents and guardians. Only parent accounts can book sessions.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <p role="alert" className={errorClass}>{error}</p>}

        <div>
          <label className={labelClass} htmlFor="name">Your full name</label>
          <input id="name" autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div>
            <label className={labelClass} htmlFor="phone">
              Phone <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input id="phone" type="tel" autoComplete="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} aria-describedby="phone-help" />
          </div>
        </div>
        <p id="phone-help" className="-mt-2 text-xs text-muted-foreground">Coaches never see your phone number or email.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} aria-describedby="password-help" />
          </div>

          <div>
            <label className={labelClass} htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
        </div>
        <p id="password-help" className="-mt-2 text-xs text-muted-foreground">At least 8 characters.</p>

        <div>
          <label className={labelClass} htmlFor="referralCode">
            Referral code <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="referralCode"
            className={inputClass}
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            placeholder="e.g. A1B2C3D4"
            aria-describedby="referral-help"
          />
          <p id="referral-help" className="mt-1.5 text-xs text-muted-foreground">
            Have a code from another parent? You&apos;ll both get {formatCents(referralBonusCents).replace(".00", "")} off
            your next booking.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-line bg-surface p-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--pitch)]"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
          />
          <span>
            I confirm I am the parent or legal guardian creating this account, and I&apos;ll give consent each time I
            book a session for my child.
          </span>
        </label>

        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-ink">Community rule:</span> {CONTACT_RULE_TEXT}
        </p>

        <button type="submit" className={`${primaryButtonClass} mt-2 w-full text-base`} disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 border-t-2 border-line pt-5 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

