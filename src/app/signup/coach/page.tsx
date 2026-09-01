"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import AuthLayout from "@/components/AuthLayout";
import { IconWhistle } from "@/components/icons";
import { inputClass, labelClass, primaryButtonClass, errorClass } from "@/lib/ui";

export default function CoachSignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
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
      router.push("/onboarding/coach");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      panelColor="gold"
      panelIcon={<IconWhistle className="h-7 w-7" />}
      panelTitle="Set your rate. Coach your sport. Get paid."
      panelPoints={[
        "Build a profile with your school, sport, and rate",
        "Get ID-verified and background-checked before you go live",
        "Funds release to you once a session is marked complete",
      ]}
    >
      <h1 className="mb-1 font-display text-3xl text-ink">Create a coach account</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Step 1 of onboarding. Next you&apos;ll build your profile and complete verification before families can
        find you.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <p className={errorClass}>{error}</p>}

        <div>
          <label className={labelClass} htmlFor="name">Full name</label>
          <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div>
          <label className={labelClass} htmlFor="password">Password</label>
          <input id="password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>

        <div>
          <label className={labelClass} htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
        </div>

        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Creating account..." : "Continue to profile setup"}
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
