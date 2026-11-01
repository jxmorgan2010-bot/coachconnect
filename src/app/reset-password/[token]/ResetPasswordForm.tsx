"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import { IconShieldCheck } from "@/components/icons";
import { errorClass, inputClass, labelClass, primaryButtonClass } from "@/lib/ui";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    if (!res) {
      setLoading(false);
      setError("We couldn't reach Assist Coaching. Check your connection and try again.");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      setLinkDead(data.code === "LINK_DEAD");
      setError(data.error ?? "Something went wrong. Try again.");
      return;
    }
    // Every session ended with the reset, including any in this browser.
    router.push("/login?reset=1");
    router.refresh();
  }

  return (
    <AuthLayout
      panelColor="pitch"
      panelIcon={<IconShieldCheck className="h-7 w-7" />}
      panelTitle="Pick something new."
      panelPoints={["At least 8 characters", "You'll be signed out on every device, then log in with the new password"]}
    >
      <h1 className="text-display-lg mb-6 font-display text-ink">Choose a new password</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className={errorClass}>
            {error}{" "}
            {linkDead && (
              <Link href="/forgot-password" className="underline underline-offset-4">
                Send a new link
              </Link>
            )}
          </p>
        )}
        <div>
          <label className={labelClass} htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="confirm">Type it again</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            className={inputClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <button type="submit" className={`${primaryButtonClass} mt-2 w-full text-base`} disabled={loading}>
          {loading ? "Saving..." : "Save new password"}
        </button>
      </form>
    </AuthLayout>
  );
}
