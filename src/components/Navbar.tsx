"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { IconWhistle } from "@/components/icons";
import { secondaryButtonClass } from "@/lib/ui";

export default function Navbar() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b-2 border-ink bg-chalk">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md border-2 border-ink bg-pitch text-gold">
            <IconWhistle className="h-5 w-5" />
          </span>
          <span className="font-display text-xl tracking-wide text-ink">
            Coach<span className="text-pitch">Connect</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-bold text-ink sm:flex">
          <Link href="/coaches" className="border-b-2 border-transparent pb-1 hover:border-gold">
            See coaches near you
          </Link>
          {status === "authenticated" && session.user.role === "COACH" && (
            <Link href="/onboarding/coach" className="border-b-2 border-transparent pb-1 hover:border-gold">
              My coach profile
            </Link>
          )}
          {status === "authenticated" && session.user.role === "ADMIN" && (
            <Link href="/admin" className="border-b-2 border-transparent pb-1 hover:border-gold">
              Admin
            </Link>
          )}
          {status === "authenticated" && session.user.role === "PARENT" && (
            <Link href="/dashboard" className="border-b-2 border-transparent pb-1 hover:border-gold">
              Dashboard
            </Link>
          )}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          {status === "authenticated" ? (
            <>
              <span className="text-sm text-muted-foreground">Hey, {session.user.name?.split(" ")[0]}</span>
              <button onClick={() => signOut({ callbackUrl: "/" })} className={secondaryButtonClass}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-bold text-ink hover:text-pitch">
                Log in
              </Link>
              <Link href="/signup" className={secondaryButtonClass}>
                Sign up
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-md border-2 border-ink p-2 sm:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className="block h-0.5 w-5 bg-ink" />
          <span className="mt-1 block h-0.5 w-5 bg-ink" />
          <span className="mt-1 block h-0.5 w-5 bg-ink" />
        </button>
      </div>

      {open && (
        <div className="border-t-2 border-ink px-4 py-3 sm:hidden">
          <nav className="flex flex-col gap-3 text-sm font-bold text-ink">
            <Link href="/coaches" onClick={() => setOpen(false)}>
              See coaches near you
            </Link>
            {status === "authenticated" ? (
              <>
                {session.user.role === "COACH" && <Link href="/onboarding/coach">My coach profile</Link>}
                {session.user.role === "ADMIN" && <Link href="/admin">Admin</Link>}
                {session.user.role === "PARENT" && <Link href="/dashboard">Dashboard</Link>}
                <button className="text-left" onClick={() => signOut({ callbackUrl: "/" })}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)}>
                  Log in
                </Link>
                <Link href="/signup" onClick={() => setOpen(false)}>
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
