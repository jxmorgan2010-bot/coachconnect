"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Folder-tab section nav shared by the parent dashboard and admin. */
export default function TabNav({ label, tabs }: { label: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="mb-8 border-b-2 border-ink">
      <ul className="-mb-0.5 flex gap-0.5 overflow-x-auto sm:gap-2">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-t-md border-2 border-b-0 px-2 text-[13px] font-bold sm:px-4 sm:text-sm ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-transparent text-ink hover:border-line hover:bg-muted"
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
