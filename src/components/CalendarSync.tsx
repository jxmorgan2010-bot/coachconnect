"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorClass, inputClass, primaryButtonClass, secondaryButtonClass, successClass } from "@/lib/ui";
import { IconCalendar } from "@/components/icons";

type Child = { id: string; firstName: string };

/**
 * "Sync to my calendar": the private feed (src/lib/calendarFeed.ts). The link exists only in this
 * component's state right after it's made or reset. The server keeps a hash, so once the page is
 * left the link can't be shown again, only replaced.
 */
export default function CalendarSync({
  role,
  feed,
  kids = [],
}: {
  role: "PARENT" | "COACH";
  /** Null when the user hasn't made a link yet. Dates are preformatted on the server. */
  feed: { madeLabel: string; childIds: string[] | null } | null;
  kids?: Child[];
}) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function makeLink(isReset: boolean) {
    setBusy(true);
    setError(null);
    setCopied(false);
    setNotice(null);
    const res = await fetch("/api/calendar/feed", { method: "POST" }).catch(() => null);
    setBusy(false);
    setConfirmReset(false);
    if (!res?.ok) {
      setError("That didn't work. Try again.");
      return;
    }
    const { path } = (await res.json()) as { path: string };
    setLink(`${window.location.origin}${path}`);
    if (isReset) setNotice("Your old link has stopped working. Add this new one to your calendar.");
    router.refresh();
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked (older browsers, http): select the text so it can be copied by hand.
      const input = document.getElementById("calendar-feed-link") as HTMLInputElement | null;
      input?.select();
      setError("Couldn't copy automatically. The link is selected: copy it from the box.");
    }
  }

  const webcal = link?.replace(/^https?:\/\//, "webcal://");
  const google = webcal ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink">
        Add your sessions to your phone&apos;s calendar once, and new bookings, cancellations and changes show up there on
        their own. Entries show only the sport, {role === "PARENT" ? "your kid's first name, the coach's first name" : "the kid's first name"},
        the time, the place and a link back here.
      </p>

      {link ? (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-chalk p-3 sm:p-4">
          {notice && <p className={successClass}>{notice}</p>}
          <label htmlFor="calendar-feed-link" className="text-sm font-bold text-ink">
            Your private calendar link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="calendar-feed-link"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputClass} font-mono text-xs sm:text-xs`}
            />
            <button type="button" onClick={copy} className={`${primaryButtonClass} shrink-0`}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="text-xs font-bold text-ink">
            Save it in your calendar now. For your privacy we only show it once. Anyone with this link can see your
            sessions, so don&apos;t share it.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={webcal} className={secondaryButtonClass}>
              Subscribe on iPhone or Mac
            </a>
            <a href={google!} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>
              Add to Google Calendar
            </a>
          </div>
          <span className="sr-only" aria-live="polite">
            {copied ? "Link copied" : ""}
          </span>
        </div>
      ) : feed ? (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-line p-3 sm:p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <IconCalendar className="h-4 w-4 text-pitch" /> Your calendar link is on ({feed.madeLabel}).
          </p>
          <p className="text-sm text-muted-foreground">
            We only show the link once, so it can&apos;t be shown again here. Need it on another device, or think someone
            else has it? Reset it to get a new one.
          </p>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => makeLink(false)} disabled={busy} className={primaryButtonClass}>
            <IconCalendar className="h-4 w-4" /> {busy ? "Making your link…" : "Make my calendar link"}
          </button>
        </div>
      )}

      {feed && (
        <div className="flex flex-col gap-2">
          {confirmReset ? (
            <div className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-warning/10 p-3">
              <p className="text-sm text-ink">
                Reset your link? The old one stops working right away, so any calendar using it stops updating until you
                add the new one.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => makeLink(true)} disabled={busy} className={primaryButtonClass}>
                  {busy ? "Resetting…" : "Yes, reset my link"}
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className={secondaryButtonClass}>
                  Keep my link
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setConfirmReset(true)} className={secondaryButtonClass}>
                Reset link
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}

      {role === "PARENT" && feed && kids.length > 1 && <KidPicker kids={kids} initial={feed.childIds} />}

      <details className="group rounded-lg border-2 border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
          How to add it
          <span aria-hidden className="text-xs text-muted-foreground transition-transform group-open:rotate-180">▾</span>
        </summary>
        <dl className="flex flex-col gap-3 px-3 pb-3 text-sm">
          <div>
            <dt className="font-bold text-ink">iPhone</dt>
            <dd className="text-muted-foreground">
              Open this page on your iPhone, make or reset the link, and tap <b>Subscribe on iPhone or Mac</b>. Or go to
              Settings › Calendar › Accounts › Add Account › Other › Add Subscribed Calendar and paste the link.
            </dd>
          </div>
          <div>
            <dt className="font-bold text-ink">Google Calendar</dt>
            <dd className="text-muted-foreground">
              Tap <b>Add to Google Calendar</b>, or on a computer open calendar.google.com, choose Other calendars › + ›
              From URL, and paste the link. It then shows in the Google Calendar app on your phone.
            </dd>
          </div>
          <div>
            <dt className="font-bold text-ink">Outlook</dt>
            <dd className="text-muted-foreground">
              In Outlook on the web, choose Add calendar › Subscribe from web, paste the link and save.
            </dd>
          </div>
        </dl>
      </details>

      <p className="text-xs text-muted-foreground">
        Calendar apps check for changes on their own schedule, sometimes only every few hours, so a new booking or a
        cancellation can take a while to show up there. This page is always up to date.
      </p>
    </div>
  );
}

function KidPicker({ kids, initial }: { kids: Child[]; initial: string[] | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial ?? kids.map((k) => k.id)));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: Set<string>) {
    if (next.size === 0) return; // at least one kid; the last box can't be unticked
    setSelected(next);
    setStatus("saving");
    const all = kids.every((k) => next.has(k.id));
    const res = await fetch("/api/calendar/feed", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childIds: all ? null : [...next] }),
    }).catch(() => null);
    setStatus(res?.ok ? "saved" : "error");
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-bold text-ink">Kids in this calendar</legend>
      {kids.map((k) => {
        const checked = selected.has(k.id);
        return (
          <label key={k.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-[var(--pitch)]"
              checked={checked}
              disabled={status === "saving" || (checked && selected.size === 1)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(k.id);
                else next.delete(k.id);
                save(next);
              }}
            />
            {k.firstName}
          </label>
        );
      })}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status === "saved"
          ? "Saved. Your calendar app picks this up the next time it checks."
          : status === "error"
            ? "That didn't save. Try again."
            : "With every kid ticked, kids you add later are included too."}
      </p>
    </fieldset>
  );
}
