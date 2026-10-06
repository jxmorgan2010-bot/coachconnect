import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import AdminHeader from "@/components/AdminHeader";
import Badge from "@/components/Badge";
import ModerationActions from "./ModerationActions";

const CONTEXT_LABEL: Record<string, string> = {
  MESSAGE: "Message",
  BIO: "Coach bio",
  PROFILE: "Profile",
  PROGRESS_NOTE: "Progress note",
  TRAINING_PLAN: "Training plan",
  REVIEW: "Review",
  BOOKING_LOCATION: "Booking location",
  RECOMMENDATION: "Recommendation form",
  REPORT: "Report",
  SUPPORT: "Support request",
  DISPUTE: "Dispute",
};

const fmt = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function AdminFlaggedPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/flagged");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const now = new Date();

  const [accounts, attempts] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ strikeCount: { gt: 0 } }, { isSuspended: true }] },
      orderBy: [{ isSuspended: "desc" }, { suspendedAt: "desc" }, { strikeCount: "desc" }],
      include: {
        // Upcoming sessions on either side of the account, for an admin to handle by hand.
        parentProfile: {
          include: {
            bookings: {
              where: { status: "CONFIRMED", scheduledAt: { gte: now } },
              include: { coachProfile: { include: { user: true } }, child: true },
              orderBy: { scheduledAt: "asc" },
            },
          },
        },
        coachProfile: {
          include: {
            bookings: {
              where: { status: "CONFIRMED", scheduledAt: { gte: now } },
              include: { parentProfile: { include: { user: true } }, child: true },
              orderBy: { scheduledAt: "asc" },
            },
          },
        },
      },
    }),
    prisma.flaggedAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { name: true, email: true, role: true } }, clearedBy: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Flagged attempts">
        Text that looked like contact details or a move off CoachConnect. Matching is automatic and will sometimes
        misfire — reverse a suspension or clear strikes when it does. Bookings and payments are never changed
        automatically.
      </AdminHeader>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="accounts">
          <h2 id="accounts" className="mb-3 flex items-baseline gap-2 font-display text-3xl text-ink">
            Accounts with strikes <span className="font-sans text-sm font-bold text-muted-foreground">{accounts.length}</span>
          </h2>
          {accounts.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
              No accounts have strikes.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {accounts.map((u) => {
                const upcoming = [
                  ...(u.parentProfile?.bookings.map((b) => ({
                    id: b.id,
                    at: b.scheduledAt,
                    who: `${b.child?.firstName ?? "Session"} with coach ${b.coachProfile.user.name}`,
                    cents: b.priceCents - b.discountCents,
                    payment: b.packageId ? "package" : b.paymentStatus.toLowerCase(),
                  })) ?? []),
                  ...(u.coachProfile?.bookings.map((b) => ({
                    id: b.id,
                    at: b.scheduledAt,
                    who: `${b.child?.firstName ?? "Session"} (${b.parentProfile.user.name}'s family)`,
                    cents: b.priceCents - b.discountCents,
                    payment: b.packageId ? "package" : b.paymentStatus.toLowerCase(),
                  })) ?? []),
                ].sort((a, b) => a.at.getTime() - b.at.getTime());

                return (
                  <li key={u.id} className={`${u.isSuspended ? "card border-danger" : "card"} flex flex-col gap-4 p-4 sm:p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-2xl leading-tight text-ink">{u.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {u.email} · {u.role.toLowerCase()}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant={u.strikeCount >= 2 ? "danger" : "warning"}>
                            {u.strikeCount} strike{u.strikeCount === 1 ? "" : "s"}
                          </Badge>
                          {u.isSuspended && (
                            <Badge variant="danger">Suspended {u.suspendedAt ? fmt(u.suspendedAt) : ""}</Badge>
                          )}
                          {u.coachProfile && (
                            <Link href={`/coaches/${u.coachProfile.id}`} className="text-sm font-bold text-pitch underline">
                              Coach profile
                            </Link>
                          )}
                        </div>
                      </div>
                      <ModerationActions userId={u.id} name={u.name} isSuspended={u.isSuspended} />
                    </div>

                    {u.isSuspended && (
                      <div className="border-t-2 border-line pt-3">
                        <p className="eyebrow mb-2 text-muted-foreground">
                          Upcoming bookings to handle by hand ({upcoming.length})
                        </p>
                        {upcoming.length === 0 ? (
                          <p className="text-sm text-muted-foreground">None.</p>
                        ) : (
                          <ul className="flex flex-col gap-1.5 text-sm">
                            {upcoming.map((b) => (
                              <li key={b.id} className="flex flex-wrap gap-x-3 text-ink">
                                <span className="font-bold">{fmt(b.at)}</span>
                                <span>{b.who}</span>
                                <span className="text-muted-foreground">
                                  {formatCents(b.cents)} · {b.payment}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="log">
          <h2 id="log" className="mb-1 flex items-baseline gap-2 font-display text-3xl text-ink">
            Attempt log <span className="font-sans text-sm font-bold text-muted-foreground">{attempts.length}</span>
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Most recent 200. Reports, support requests and disputes are let through and only logged here.
          </p>
          {attempts.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
              Nothing flagged yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {attempts.map((a) => (
                <li key={a.id} className={`${a.clearedAt ? "card-flat opacity-75" : "card-flat"} flex flex-col gap-2 p-4`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-bold text-ink">
                      {a.user ? `${a.user.name} (${a.user.role.toLowerCase()})` : "No account"}
                    </span>
                    <Badge variant="neutral">{CONTEXT_LABEL[a.context] ?? a.context}</Badge>
                    {a.blocked ? (
                      a.strikeNumber ? (
                        <Badge variant={a.strikeNumber >= 2 ? "danger" : "warning"}>Strike {a.strikeNumber}</Badge>
                      ) : (
                        <Badge variant="warning">Blocked</Badge>
                      )
                    ) : (
                      <Badge variant="neutral">Logged, not blocked</Badge>
                    )}
                    {a.clearedAt && (
                      <Badge variant="success">
                        Cleared{a.clearedBy ? ` by ${a.clearedBy.name}` : ""}
                      </Badge>
                    )}
                    <time dateTime={a.createdAt.toISOString()} className="text-xs text-muted-foreground">
                      {fmt(a.createdAt)}
                    </time>
                  </div>
                  <p className="whitespace-pre-line break-words border-l-4 border-gold pl-3 text-sm text-ink">{a.blockedText}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
