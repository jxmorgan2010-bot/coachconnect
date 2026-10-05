import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import {
  isTopCoach,
  TOP_COACH_POINTS_THRESHOLD,
  POINTS_SESSION_COMPLETED,
  POINTS_REVIEW_LEFT,
  POINTS_REFERRAL_SIGNUP,
  POINTS_QUICK_REBOOK,
  POINTS_PER_DOLLAR_REDEMPTION,
} from "@/lib/points";
import Badge from "@/components/Badge";
import ParentTabs from "../ParentTabs";
import PointsRedeemForm from "./PointsRedeemForm";

const ACTION_LABEL: Record<string, string> = {
  SESSION_COMPLETED: "Session completed",
  REVIEW_LEFT: "Review left",
  REFERRAL_SIGNUP: "Referral signed up",
  QUICK_REBOOK: "Quick rebook",
  REDEEMED_FOR_CREDIT: "Redeemed for credit",
};

// Mirrors the awardPoints() calls in the API routes. Auto-completed sessions don't award
// points, so the copy says "mark complete" rather than "complete".
const PARENT_EARN_RULES = [
  { label: "Mark a session complete", points: POINTS_SESSION_COMPLETED },
  { label: "Leave a review", points: POINTS_REVIEW_LEFT },
  { label: "A parent signs up with your referral code", points: POINTS_REFERRAL_SIGNUP },
  { label: "Quick rebook a coach", points: POINTS_QUICK_REBOOK },
];

export default async function PointsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/points");
  if (session.user.role === "ADMIN") redirect("/admin");

  if (session.user.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: session.user.id } });
    if (!coachProfile) redirect("/onboarding/coach");

    const transactions = await prisma.pointsTransaction.findMany({
      where: { coachProfileId: coachProfile.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const toTopCoach = Math.max(0, TOP_COACH_POINTS_THRESHOLD - coachProfile.lifetimePoints);

    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
        <p className="eyebrow mb-2 text-pitch">Coach</p>
        <h1 className="text-display-lg font-display text-ink">Points</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          You earn {POINTS_SESSION_COMPLETED} points each time a family marks a session with you complete.
        </p>

        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <BalanceCard points={coachProfile.pointsBalance} sub={`${coachProfile.lifetimePoints} lifetime points`} />
          <div className="card-flat flex flex-col justify-center gap-3 p-5">
            {isTopCoach(coachProfile.lifetimePoints) ? (
              <>
                <Badge variant="accent">Top Coach</Badge>
                <p className="text-sm text-muted-foreground">Your profile shows the Top Coach badge.</p>
              </>
            ) : (
              <>
                <p className="font-bold text-ink">Top Coach badge</p>
                <Meter value={coachProfile.lifetimePoints} max={TOP_COACH_POINTS_THRESHOLD} />
                <p className="text-sm text-muted-foreground">
                  {toTopCoach} more lifetime points to earn it ({TOP_COACH_POINTS_THRESHOLD} total).
                </p>
              </>
            )}
          </div>
        </div>

        <PointsHistory transactions={transactions} />
      </div>
    );
  }

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) redirect("/dashboard");

  const transactions = await prisma.pointsTransaction.findMany({
    where: { parentProfileId: parentProfile.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
      <p className="eyebrow mb-2 text-pitch">Parent dashboard</p>
      <h1 className="text-display-lg font-display text-ink">Points</h1>
      <p className="mt-2 mb-6 text-muted-foreground">
        Earn points as you go and turn them into booking credit: {POINTS_PER_DOLLAR_REDEMPTION} points ={" "}
        {formatCents(100).replace(".00", "")}.
      </p>

      <ParentTabs />

      <div className="mb-10 grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col gap-4 p-5">
          <BalanceCard points={parentProfile.pointsBalance} sub="Available to redeem" bare />
          <PointsRedeemForm pointsBalance={parentProfile.pointsBalance} />
        </div>
        <div className="card-flat p-5">
          <h2 className="mb-3 font-display text-2xl leading-none text-ink">How you earn</h2>
          <dl className="flex flex-col divide-y-2 divide-line">
            {PARENT_EARN_RULES.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm text-ink">{r.label}</dt>
                <dd className="shrink-0 font-display text-xl leading-none text-pitch">+{r.points}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <PointsHistory transactions={transactions} />
    </div>
  );
}

function BalanceCard({ points, sub, bare = false }: { points: number; sub: string; bare?: boolean }) {
  return (
    <div className={bare ? "" : "card flex flex-col justify-center p-5"}>
      <p className="eyebrow text-muted-foreground">Balance</p>
      <p className="mt-1 font-display text-5xl leading-none text-ink">
        {points.toLocaleString("en-US")}
        <span className="ml-1.5 font-sans text-base font-bold text-muted-foreground">pts</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label="Progress toward Top Coach"
      className="h-4 overflow-hidden rounded border-2 border-ink bg-muted"
    >
      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
    </div>
  );
}

function PointsHistory({ transactions }: { transactions: { id: string; action: string; points: number; createdAt: Date }[] }) {
  return (
    <section aria-labelledby="points-history">
      <h2 id="points-history" className="mb-3 font-display text-3xl text-ink">History</h2>
      {transactions.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-muted-foreground">
          No points yet. They&apos;ll show up here as you earn them.
        </p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-line overflow-hidden rounded-lg border-2 border-ink bg-surface">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-ink">{ACTION_LABEL[t.action] ?? t.action}</p>
                <p className="text-xs text-muted-foreground">
                  {t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <p className={`font-display text-xl leading-none ${t.points >= 0 ? "text-pitch" : "text-muted-foreground"}`}>
                {t.points >= 0 ? "+" : ""}
                {t.points}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
