import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { ACCOUNT_SUSPENDED_MESSAGE } from "@/lib/contactRule";

/**
 * Site-wide banner for a signed-in account suspended under the contact-sharing policy.
 * Server component: reads the account fresh on every request, so lifting a suspension
 * in admin takes effect on the next page load without signing out.
 */
export default async function SuspensionNotice() {
  const session = await getCurrentSession();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuspended: true, suspendedAt: true },
  });
  if (!user?.isSuspended) return null;

  return (
    <div role="alert" className="border-b-2 border-ink bg-danger px-4 py-3 text-white sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <p className="eyebrow shrink-0">Account suspended</p>
        <p className="text-sm font-bold">{ACCOUNT_SUSPENDED_MESSAGE}</p>
      </div>
    </div>
  );
}
