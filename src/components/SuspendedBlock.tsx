import Link from "next/link";
import { ACCOUNT_SUSPENDED_MESSAGE } from "@/lib/contactRule";
import { secondaryButtonClass } from "@/lib/ui";

/** Shown in place of a booking or package form when the signed-in account is suspended. */
export default function SuspendedBlock({ action }: { action: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="card-flat flex flex-col items-start gap-4 border-danger p-6 sm:p-8">
        <p className="eyebrow text-danger">Account suspended</p>
        <h1 className="text-display-md font-display text-ink">You can&apos;t {action} right now</h1>
        <p className="text-muted-foreground">{ACCOUNT_SUSPENDED_MESSAGE}</p>
        <Link href="/dashboard" className={secondaryButtonClass}>Go to your dashboard</Link>
      </div>
    </div>
  );
}
