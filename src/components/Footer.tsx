"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconShieldCheck, IconMessage, IconPin } from "@/components/icons";

// Only claims the app actually enforces: an admin approves each coach before the profile
// is searchable, chat stays in-app, and the parent sets the meeting place.
// Background checks are a placeholder today, so they are deliberately not claimed here.
const PROMISES = [
  { icon: IconShieldCheck, text: "An admin approves every coach before their profile goes live" },
  { icon: IconMessage, text: "Parents and coaches message in the app — contact details aren't shown" },
  { icon: IconPin, text: "The parent picks where the session happens" },
];

export default function Footer() {
  // The home page has its own, fuller safeguards section right above the footer.
  const showPromises = usePathname() !== "/";

  return (
    <footer className="on-dark border-t-2 border-ink bg-ink text-chalk">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pb-10">
        {showPromises && (
          <ul className="mb-6 grid gap-4 border-b border-white/15 pb-8 text-sm font-bold sm:grid-cols-3 sm:gap-6">
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 border-l-4 border-gold pl-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 text-xs text-white/70 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-display text-2xl tracking-wide text-white">
              Assist <span className="text-gold">Coaching</span>
            </p>
            <Link href="/about" className="inline-flex min-h-11 items-center text-sm font-bold text-white underline-offset-4 hover:text-gold-bright hover:underline">
              About Assist Coaching
            </Link>
          </div>
          <p className="max-w-md sm:text-right">
            &copy; {new Date().getFullYear()} Assist Coaching · Bay Area. See something off? Use Report on any coach
            profile or message thread.
          </p>
        </div>
      </div>
    </footer>
  );
}
