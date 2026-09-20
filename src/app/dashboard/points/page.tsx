import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isTopCoach, TOP_COACH_POINTS_THRESHOLD } from "@/lib/points";
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

    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-1 font-display text-3xl text-ink">Points</h1>
        <p className="mb-6 text-muted-foreground">Earn points for every session you complete.</p>

        <div className="card mb-8 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-display text-3xl text-ink">{coachProfile.pointsBalance} pts</p>
            <p className="text-xs text-muted-foreground">{coachProfile.lifetimePoints} lifetime points</p>
          </div>
          {isTopCoach(coachProfile.lifetimePoints) ? (
            <Badge variant="accent">Top Coach</Badge>
          ) : (
            <p className="text-sm text-muted-foreground">
              {TOP_COACH_POINTS_THRESHOLD - coachProfile.lifetimePoints} more lifetime points to earn the Top Coach badge.
            </p>
          )}
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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl text-ink">Points</h1>
      <p className="mb-6 text-muted-foreground">Earn points for completing sessions, leaving reviews, and referring friends.</p>

      <ParentTabs />

      <div className="card mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-display text-3xl text-ink">{parentProfile.pointsBalance} pts</p>
          <p className="text-xs text-muted-foreground">Redeem points for booking credit.</p>
        </div>
        <div className="w-full sm:max-w-xs">
          <PointsRedeemForm pointsBalance={parentProfile.pointsBalance} />
        </div>
      </div>

      <PointsHistory transactions={transactions} />
    </div>
  );
}

function PointsHistory({ transactions }: { transactions: { id: string; action: string; points: number; createdAt: Date }[] }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl text-ink">History</h2>
      {transactions.length === 0 ? (
        <p className="text-muted-foreground">No points activity yet.</p>
      ) : (
        <div className="flex flex-col divide-y-2 divide-line rounded-lg border-2 border-ink">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm font-bold text-ink">{ACTION_LABEL[t.action] ?? t.action}</p>
                <p className="text-xs text-muted-foreground">{t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
              </div>
              <p className={`font-display text-lg ${t.points >= 0 ? "text-pitch" : "text-muted-foreground"}`}>
                {t.points >= 0 ? "+" : ""}{t.points}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
