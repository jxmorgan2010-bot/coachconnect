import Link from "next/link";
import { secondaryButtonClass } from "@/lib/ui";

/** Dead-end state for one-time links (recommendations, guardian consent). */
export default function LinkNotFound({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
        <p className="eyebrow text-muted-foreground">Link not found</p>
        <h1 className="text-display-md font-display text-ink">This {what} link doesn&apos;t work</h1>
        <p className="text-muted-foreground">
          It may be mistyped, already used, or expired. Ask the person who sent it for a new link.
        </p>
        <Link href="/" className={secondaryButtonClass}>Go to CoachConnect</Link>
      </div>
    </div>
  );
}
