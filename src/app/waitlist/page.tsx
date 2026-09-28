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
        "We're expanding to new regions soon",
        "Drop your email and zip and we'll notify you first",
      ]}
    >
      {done ? (
        <>
          <h1 className="mb-1 font-display text-3xl text-ink">You&apos;re on the list</h1>
          <p className={successClass}>We&apos;ll email you as soon as CoachConnect reaches your area.</p>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/" className="font-bold text-pitch">
              Back to home
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="mb-1 font-display text-3xl text-ink">Join the waitlist</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            CoachConnect currently only serves the Bay Area. Tell us where you are and we&apos;ll reach out when we
            expand.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && <p className={errorClass}>{error}</p>}

            <div>
              <label className={labelClass} htmlFor="email">Email</label>
              <input id="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div>
              <label className={labelClass} htmlFor="zip">Zip code</label>
              <input id="zip" className={inputClass} maxLength={10} value={zip} onChange={(e) => setZip(e.target.value)} required />
            </div>

            <div>
              <label className={labelClass} htmlFor="role">I am a...</label>
              <select id="role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value as "PARENT" | "COACH" | "")}>
                <option value="">Prefer not to say</option>
                <option value="PARENT">Parent / Guardian</option>
                <option value="COACH">Coach</option>
              </select>
            </div>

            <button type="submit" className={primaryButtonClass} disabled={loading}>
              {loading ? "Joining..." : "Notify me"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already in the Bay Area?{" "}
            <Link href="/signup" className="font-bold text-pitch">
              Sign up now
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
