import type { Metadata } from "next";
import Link from "next/link";
import { isResetTokenUsable, RESET_LINK_DEAD } from "@/lib/passwordReset";
import { primaryButtonClass } from "@/lib/ui";
import ResetPasswordForm from "./ResetPasswordForm";

// The token is in the URL: keep it out of search indexes and Referer headers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!(await isResetTokenUsable(token))) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
          <p className="eyebrow text-muted-foreground">Link expired</p>
          <h1 className="text-display-md font-display text-ink">This reset link doesn&apos;t work anymore</h1>
          <p className="text-muted-foreground">{RESET_LINK_DEAD} Links work once and expire after 1 hour.</p>
          <Link href="/forgot-password" className={primaryButtonClass}>Send a new link</Link>
        </div>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
