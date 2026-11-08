import type { CalendarLinks } from "@/lib/calendar";
import { IconCalendar } from "@/components/icons";

/**
 * "Add to calendar" for one session: the .ics download (Apple Calendar, Outlook desktop and most
 * other apps), Google Calendar and Outlook on the web. A native <details>, so it works without
 * JavaScript and stays one line on a busy booking card until it's opened.
 */
export default function AddToCalendar({ links, className = "" }: { links: CalendarLinks; className?: string }) {
  const item =
    "inline-flex min-h-11 items-center rounded-lg border-2 border-ink bg-surface px-3.5 py-2 text-sm font-bold text-ink hover:bg-muted";
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-bold text-ink underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
        <IconCalendar className="h-4 w-4 text-pitch" />
        Add to calendar
        <span aria-hidden className="text-xs text-muted-foreground transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-2 flex flex-wrap gap-2">
        <a href={links.ics} download className={item}>
          Apple / .ics file
        </a>
        <a href={links.google} target="_blank" rel="noopener noreferrer" className={item}>
          Google Calendar
        </a>
        <a href={links.outlook} target="_blank" rel="noopener noreferrer" className={item}>
          Outlook
        </a>
      </div>
    </details>
  );
}
