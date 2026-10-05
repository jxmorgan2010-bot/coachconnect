"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { IconWhistle } from "@/components/icons";
import { secondaryButtonClass } from "@/lib/ui";

type NavLink = { href: string; label: string };

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const role = status === "authenticated" ? session.user.role : null;
  const links: NavLink[] = [
    { href: "/coaches", label: "See coaches near you" },
    ...(role === "COACH" ? [{ href: "/onboarding/coach", label: "My coach profile" }] : []),
    ...(role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
    ...(role === "PARENT" ? [{ href: "/dashboard", label: "Dashboard" }] : []),
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b-2 border-ink bg-chalk">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-md" onClick={() => setOpen(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-md border-2 border-ink bg-pitch text-gold">
            <IconWhistle className="h-5 w-5" />
          </span>
          <span className="font-display text-xl tracking-wide text-ink">
            Coach<span className="text-pitch">Connect</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-bold text-ink md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`flex min-h-11 items-center border-b-[3px] pt-[3px] ${
                isActive(l.href) ? "border-gold" : "border-transparent hover:border-gold"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {status === "authenticated" ? (
            <>
              <span className="text-sm text-muted-foreground">Hey, {session.user.name?.split(" ")[0]}</span>
              <button onClick={() => signOut({ callbackUrl: "/" })} className={secondaryButtonClass}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="flex min-h-11 items-center px-1 text-sm font-bold text-ink hover:text-pitch">
                Log in
              </Link>
              <Link href="/signup" className={secondaryButtonClass}>
                Sign up
              </Link>
            </>
          )}
        </div>

        <button
          className="grid h-11 w-11 place-items-center rounded-md border-2 border-ink bg-surface md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <span className="relative block h-3.5 w-5" aria-hidden>
            <span
              className={`absolute left-0 h-0.5 w-5 bg-ink transition-transform motion-reduce:transition-none ${
                open ? "top-1.5 rotate-45" : "top-0"
              }`}
            />
            <span className={`absolute left-0 top-1.5 h-0.5 w-5 bg-ink ${open ? "opacity-0" : ""}`} />
            <span
              className={`absolute left-0 h-0.5 w-5 bg-ink transition-transform motion-reduce:transition-none ${
                open ? "top-1.5 -rotate-45" : "top-3"
              }`}
            />
          </span>
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t-2 border-ink bg-chalk md:hidden">
          <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-col px-4 py-2 font-bold text-ink">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`flex min-h-12 items-center border-b border-line border-l-4 pl-3 ${
                  isActive(l.href) ? "border-l-gold" : "border-l-transparent"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="flex gap-3 py-3">
              {status === "authenticated" ? (
                <button
                  className={`${secondaryButtonClass} flex-1`}
                  onClick={() => {
                    setOpen(false);
                    signOut({ callbackUrl: "/" });
                  }}
                >
                  Sign out
                </button>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)} className={`${secondaryButtonClass} flex-1`}>
                    Log in
                  </Link>
                  <Link href="/signup" onClick={() => setOpen(false)} className={`${secondaryButtonClass} flex-1`}>
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
