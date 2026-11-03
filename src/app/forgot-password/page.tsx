"use client";

import { useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import { IconShieldCheck } from "@/components/icons";
import { errorClass, inputClass, labelClass, primaryButtonClass, quietLinkClass, successClass } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setLoading(false);
    if (!res) {
      setError("We couldn't reach Assist Coaching. Check your connection and try again.");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Try again.");
      return;
    }
    setSent(true);
  }

  return (
    <AuthLayout
      panelColor="pitch"
      panelIcon={<IconShieldCheck className="h-7 w-7" />}
      panelTitle="Back in the game in a minute."
      panelPoints={[
        "The link in the email works once and expires in 1 hour",
        "Choosing a new password signs you out on every other device",
      ]}
    >
      <h1 className="text-display-lg mb-2 font-display text-ink">Forgot password?</h1>
      <p className="mb-6 text-muted-foreground">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
      {sent ? (
        <div className="flex flex-col gap-4">
          <p role="status" className={successClass}>
            If that email has an account, we&apos;ve sent a link. Check your inbox and spam folder.
          </p>
          <button type="button" className={`${quietLinkClass} self-start text-pitch`} onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <div>
            <label className={labelClass} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className={`${primaryButtonClass} mt-2 w-full text-base`} disabled={loading}>
            {loading ? "Sending..." : "Send me a link"}
          </button>
        </form>
      )}
      <p className="mt-6 border-t-2 border-line pt-5 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
