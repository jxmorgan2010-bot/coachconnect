import Link from "next/link";
import { IconCalendar } from "@/components/icons";
import { secondaryButtonClass } from "@/lib/ui";

/**
 * Shown wherever a booking button would be when the coach hasn't posted weekly hours.
 * `compact` fits the profile's booking card; the full version replaces a booking page.
 */
export default function NoHoursNotice({
  coachFirstName,
  coachProfileId,
  compact = false,
}: {
  coachFirstName: string;
  coachProfileId: string;
  compact?: boolean;
}) {
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-ink bg-chalk text-pitch">
        <IconCalendar className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-xl leading-none text-ink">This coach hasn&apos;t posted hours yet</p>
        <p className="text-sm text-muted-foreground">
          You can book {coachFirstName} once they add their weekly hours. You can still send a message to ask about
          times.
        </p>
      </div>
    </>
  );

  if (compact) {
    return <div className="flex gap-3 rounded-lg border-2 border-dashed border-line p-3">{body}</div>;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
        <div className="flex gap-3">{body}</div>
        <Link href={`/coaches/${coachProfileId}`} className={secondaryButtonClass}>
          Back to {coachFirstName}&apos;s profile
        </Link>
      </div>
    </div>
  );
}
