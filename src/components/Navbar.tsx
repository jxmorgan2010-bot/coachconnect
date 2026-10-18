"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { IconWhistle } from "@/components/icons";
import SignOutButton from "@/components/SignOutButton";
import CountBadge from "@/components/CountBadge";
import { useUnreadMessages } from "@/components/useUnreadMessages";
import { secondaryButtonClass } from "@/lib/ui";

type NavLink = { href: string; label: string; unread?: number };

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const role = status === "authenticated" ? session.user.role : null;
  const hasMessages = role === "PARENT" || role === "COACH";
  // Conversations with something unread, so it matches the highlighted rows on /messages.
  const unread = useUnreadMessages(hasMessages, pathname).threads;
  const messagesLink: NavLink = { href: "/messages", label: "Messages", unread };
  const links: NavLink[] = [
    { href: "/coaches", label: "See coaches near you" },
    ...(role === "COACH"
      ? [
          { href: "/dashboard", label: "Dashboard" },
          messagesLink,
          { href: "/dashboard/profile", label: "My profile" },
        ]
      : []),
    ...(role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
    ...(role === "PARENT"
      ? [
          { href: "/dashboard", label: "Dashboard" },
          messagesLink,
          { href: "/dashboard/family", label: "My family" },
        ]
      : []),
  ];
  const linkContent = (l: NavLink) => (
    <>
      {l.label}
      {l.unread ? (
        <>
          <CountBadge className="ml-1.5" aria-hidden>{l.unread}</CountBadge>
          <span className="sr-only">, {l.unread} unread</span>
        </>
      ) : null}
    </>
  );
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // Only the most specific match is current, so "Dashboard" isn't also lit on /dashboard/profile.
  const activeHref = links
    .map((l) => l.href)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

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

        <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-bold text-ink lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`flex min-h-11 items-center border-b-[3px] pt-[3px] ${
                isActive(l.href) ? "border-gold" : "border-transparent hover:border-gold"
              }`}
            >
              {linkContent(l)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {status === "authenticated" ? (
            <>
              <span className="text-sm text-muted-foreground">Hey, {session.user.name?.split(" ")[0]}</span>
              <SignOutButton className={secondaryButtonClass} floatingError />
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
          className="relative grid h-11 w-11 place-items-center rounded-md border-2 border-ink bg-surface lg:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={`${open ? "Close menu" : "Open menu"}${unread ? ", new messages" : ""}`}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {/* Parents mostly use phones: show new messages without them opening the menu */}
          {unread > 0 && !open && (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-gold"
            />
          )}
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
        <div id="mobile-menu" className="border-t-2 border-ink bg-chalk lg:hidden">
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
                {linkContent(l)}
              </Link>
            ))}
            <div className="flex gap-3 py-3">
              {status === "authenticated" ? (
                <SignOutButton className={`${secondaryButtonClass} w-full`} wrapperClassName="flex-1" />
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
