"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import AuthLayout from "@/components/AuthLayout";
import { IconUsers } from "@/components/icons";
import { inputClass, labelClass, primaryButtonClass, errorClass } from "@/lib/ui";

function ParentSignupForm() {
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
        "Only verified parents and guardians can book sessions",
        "Every coach is ID-verified and background-checked first",
        "You pick the park, gym, or rec center — not the coach",
      ]}
    >
      <h1 className="mb-1 font-display text-3xl text-ink">Create a parent account</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Bookings can only be made by a verified parent or guardian — never directly by a minor.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <p className={errorClass}>{error}</p>}

        <div>
          <label className={labelClass} htmlFor="name">Your full name</label>
          <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div>
          <label className={labelClass} htmlFor="phone">Phone (optional, kept private)</label>
          <input id="phone" type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div>
          <label className={labelClass} htmlFor="password">Password</label>
          <input id="password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>

        <div>
          <label className={labelClass} htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
        </div>

        <div>
          <label className={labelClass} htmlFor="referralCode">Referral code (optional)</label>
          <input
            id="referralCode"
            className={inputClass}
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            placeholder="e.g. A1B2C3D4"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Have a code from another parent? You&apos;ll both get $10 off your next booking.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="mt-1"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
          />
          I confirm I am the parent or legal guardian creating this account, and that I will provide consent
          before any coach can accept a booking with my family.
        </label>

        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-pitch">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function ParentSignupPage() {
  return (
    <Suspense>
      <ParentSignupForm />
    </Suspense>
  );
}
