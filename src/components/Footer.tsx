"use client";

import { usePathname } from "next/navigation";
import { IconShieldCheck, IconMessage, IconPin } from "@/components/icons";

// Only claims the app actually enforces: an admin approves each coach's ID before the
// profile is searchable, chat stays in-app, and the parent sets the meeting place.
// Background checks are a placeholder today, so they are deliberately not claimed here.
const PROMISES = [
  { icon: IconShieldCheck, text: "A person reviews every coach's ID before their profile goes live" },
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
          <p className="font-display text-2xl tracking-wide text-white">
            Coach<span className="text-gold">Connect</span>
          </p>
          <p className="max-w-md sm:text-right">
            &copy; {new Date().getFullYear()} CoachConnect · Bay Area. See something off? Use Report on any coach
            profile or message thread.
          </p>
        </div>
      </div>
    </footer>
  );
}
