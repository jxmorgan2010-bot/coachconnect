"use client";

import { useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import { IconPin } from "@/components/icons";
import { inputClass, labelClass, primaryButtonClass, errorClass, successClass } from "@/lib/ui";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [role, setRole] = useState<"PARENT" | "COACH" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, zip, role: role || undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setDone(true);
  }

  return (
    <AuthLayout
      panelColor="ink"
      panelIcon={<IconPin className="h-7 w-7" />}
      panelTitle="Not in the Bay Area yet? We'll let you know."
      panelPoints={[
        "CoachConnect is Bay Area only at launch",
        "Leave your email and zip and we'll email you if we launch near you",
      ]}
    >
      {done ? (
        <>
          <h1 className="text-display-lg mb-3 font-display text-ink">You&apos;re on the list</h1>
          <p role="status" className={successClass}>We&apos;ll email you if CoachConnect launches in your area.</p>
          <p className="mt-6 border-t-2 border-line pt-5 text-sm text-muted-foreground">
            <Link href="/" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
              Back to home
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="eyebrow mb-2 text-pitch">Outside the Bay Area</p>
          <h1 className="text-display-lg mb-2 font-display text-ink">Join the waitlist</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            CoachConnect only serves the Bay Area right now. Tell us where you are and we&apos;ll email you if we
            launch near you.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && <p role="alert" className={errorClass}>{error}</p>}

            <div>
              <label className={labelClass} htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div>
              <label className={labelClass} htmlFor="zip">Zip code</label>
              <input id="zip" inputMode="numeric" autoComplete="postal-code" className={inputClass} maxLength={10} value={zip} onChange={(e) => setZip(e.target.value)} required />
            </div>

            <div>
              <label className={labelClass} htmlFor="role">I am a...</label>
              <select id="role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value as "PARENT" | "COACH" | "")}>
                <option value="">Prefer not to say</option>
                <option value="PARENT">Parent / Guardian</option>
                <option value="COACH">Coach</option>
              </select>
            </div>

            <button type="submit" className={`${primaryButtonClass} mt-2 w-full text-base`} disabled={loading}>
              {loading ? "Joining..." : "Notify me"}
            </button>
          </form>

          <p className="mt-6 border-t-2 border-line pt-5 text-sm text-muted-foreground">
            Already in the Bay Area?{" "}
            <Link href="/signup" className="inline-flex min-h-11 items-center font-bold text-pitch underline-offset-4 hover:underline">
              Sign up now
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
