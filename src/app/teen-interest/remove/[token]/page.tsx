import type { Metadata } from "next";
import Link from "next/link";
import { secondaryButtonClass } from "@/lib/ui";
import { findByRemoveToken } from "@/lib/teenInterestStore";
import RemoveButton from "./RemoveButton";

// The token is in the URL: keep it out of search indexes and Referer headers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * From the teen interest confirmation email. Opening the link changes nothing (email scanners open
 * links); the button deletes the entry.
 */
export default async function RemoveTeenInterestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entry = await findByRemoveToken(token);
  if (!entry) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
          <p className="eyebrow text-muted-foreground">Link not found</p>
          <h1 className="text-display-md font-display text-ink">This removal link doesn&apos;t work</h1>
          <p className="text-muted-foreground">
            The entry may already be removed, or you signed up again and a newer confirmation email has the current link.
          </p>
          <Link href="/" className={secondaryButtonClass}>Go to Assist Coaching</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
        <p className="eyebrow text-pitch">Teen interest list</p>
        <h1 className="text-display-md font-display text-ink">Remove yourself from the list?</h1>
        <p className="break-words text-ink">
          This deletes the entry for <span className="font-bold">{entry.email}</span>: your name, sports, school, graduation
          year and any parent or guardian email. We won&apos;t email you about coaching under 18.
        </p>
        <RemoveButton token={token} />
      </div>
    </div>
  );
}
