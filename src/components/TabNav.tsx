"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Folder-tab section nav shared by the parent dashboard and admin. */
export default function TabNav({ label, tabs }: { label: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="mb-8 border-b-2 border-ink">
      <ul className="flex flex-wrap gap-1.5 pb-2 sm:-mb-0.5 sm:flex-nowrap sm:gap-2 sm:pb-0">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-md border-2 px-3 text-sm font-bold sm:rounded-b-none sm:border-b-0 sm:px-4 ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-line text-ink hover:bg-muted sm:border-transparent sm:hover:border-line"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
