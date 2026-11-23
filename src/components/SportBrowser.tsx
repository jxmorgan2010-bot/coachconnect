"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Sport } from "@/generated/prisma/client";
import { SPORT_COLOR, SPORT_GROUPS, SPORT_LABELS, sportsInGroup } from "@/lib/sports";

/** Shown before "All sports" is opened. The owner's pick; not labelled "most popular" on the page. */
const FEATURED_SPORTS: Sport[] = ["BASKETBALL", "SOCCER", "BASEBALL", "FOOTBALL", "TENNIS", "VOLLEYBALL"];

function SportChip({ sport }: { sport: Sport }) {
  const c = SPORT_COLOR[sport];
  return (
    <Link
      href={`/coaches?sport=${sport}`}
      aria-label={`${SPORT_LABELS[sport]} coaches`}
      className="press flex min-h-11 items-center whitespace-nowrap rounded-lg border-2 border-ink px-3.5 font-display text-base tracking-wide shadow-patch-xs"
      style={{ background: c.bg, color: c.fg }}
    >
      {SPORT_LABELS[sport]}
    </Link>
  );
}

/** Home page "Browse by sport": six sports up front, every sport (grouped) one tap away. */
export default function SportBrowser() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  // The button moves when the list opens or closes, so keep keyboard focus on it.
  useEffect(() => {
    if (toggled.current) toggleRef.current?.focus();
  }, [open]);

  const toggle = (
    <button
      ref={toggleRef}
      type="button"
      aria-expanded={open}
      aria-controls="sport-browser"
      onClick={() => {
        toggled.current = true;
        setOpen((o) => !o);
      }}
      className="press flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border-2 border-ink bg-surface px-3.5 text-sm font-bold text-ink shadow-patch-xs hover:bg-muted"
    >
      {open ? "Fewer sports" : "All sports"}
      <span aria-hidden className={`text-xs ${open ? "rotate-180" : ""}`}>
        ▾
      </span>
    </button>
  );

  return (
    <div id="sport-browser">
      {open ? (
        <>
          <div className="grid gap-5 md:grid-cols-2 md:gap-x-10 md:gap-y-6">
            {SPORT_GROUPS.map((group) => (
              <div key={group.id} className="min-w-0">
                <h3
                  id={`sport-group-${group.id}`}
                  className="mb-2.5 border-l-4 border-gold pl-2 font-sans text-xs font-bold uppercase leading-none tracking-wide text-ink"
                >
                  {group.label}
                </h3>
                <ul aria-labelledby={`sport-group-${group.id}`} className="flex flex-wrap gap-2.5">
                  {sportsInGroup(group.id).map((sport) => (
                    <li key={sport}>
                      <SportChip sport={sport} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6">{toggle}</div>
        </>
      ) : (
        <div className="flex flex-wrap items-start gap-2.5">
          <ul aria-label="Sports" className="flex flex-wrap gap-2.5">
            {FEATURED_SPORTS.map((sport) => (
              <li key={sport}>
                <SportChip sport={sport} />
              </li>
            ))}
          </ul>
          {toggle}
        </div>
      )}
    </div>
  );
}
