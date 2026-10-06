"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import AuthLayout from "@/components/AuthLayout";
import { IconWhistle } from "@/components/icons";
import { inputClass, labelClass, primaryButtonClass, errorClass } from "@/lib/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { redirect: false, email, password });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <AuthLayout
      panelColor="ink"
      panelIcon={<IconWhistle className="h-7 w-7" />}
      panelTitle="Good to see you back on the roster."
      panelPoints={[
        "Parents: your bookings, family, and points are on your dashboard",
        "Coaches: check your verification status and upcoming sessions",
      ]}
    >
      <h1 className="text-display-lg mb-6 font-display text-ink">Log in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <div>
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className={`${primaryButtonClass} mt-2 w-full text-base`} disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="mt-6 border-t-2 border-line pt-5 text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
