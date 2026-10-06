import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AdminHeader from "@/components/AdminHeader";
import ReportRow from "./ReportRow";

async function describeTarget(targetType: string, targetId: string): Promise<string> {
  if (targetType === "COACH_PROFILE") {
    const coach = await prisma.coachProfile.findUnique({ where: { id: targetId }, include: { user: true } });
    return coach ? `Coach: ${coach.user.name}` : "Coach (deleted)";
  }
  if (targetType === "PARENT_PROFILE") {
    const parent = await prisma.parentProfile.findUnique({ where: { id: targetId }, include: { user: true } });
    return parent ? `Parent: ${parent.user.name}` : "Parent (deleted)";
  }
  if (targetType === "MESSAGE") {
    const thread = await prisma.thread.findUnique({
      where: { id: targetId },
      include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
    });
    return thread ? `Conversation: ${thread.parentProfile.user.name} <> ${thread.coachProfile.user.name}` : "Conversation (deleted)";
  }
  if (targetType === "SUPPORT_REQUEST") {
    if (targetId === "general") return "Support request: general";
    const booking = await prisma.booking.findUnique({
      where: { id: targetId },
      include: { coachProfile: { include: { user: true } }, parentProfile: { include: { user: true } } },
    });
    return booking
      ? `Support request: ${booking.parentProfile.user.name} <> ${booking.coachProfile.user.name} session`
      : "Support request";
  }
  return targetType;
}

export default async function AdminReportsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/reports");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const reports = await prisma.report.findMany({
    include: { reporter: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const rows = await Promise.all(
    reports.map(async (r) => ({
      id: r.id,
      reporterName: r.reporter.name,
      target: await describeTarget(r.targetType, r.targetId),
      targetType: r.targetType,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    })),
  );

  const open = rows.filter((r) => r.status === "OPEN");
  const closed = rows.filter((r) => r.status !== "OPEN");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Reports">
        Reports on coach profiles and message threads, plus support requests. A coach is auto-suspended once they hit
        3 open reports.
      </AdminHeader>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="open-reports">
          <h2 id="open-reports" className="mb-3 flex items-baseline gap-2 font-display text-3xl text-ink">
            Open <span className="font-sans text-sm font-bold text-muted-foreground">{open.length}</span>
          </h2>
          {open.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
              No open reports.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {open.map((r) => (
                <li key={r.id}>
                  <ReportRow report={r} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {closed.length > 0 && (
          <section aria-labelledby="closed-reports">
            <h2 id="closed-reports" className="mb-3 flex items-baseline gap-2 font-display text-3xl text-ink">
              Closed <span className="font-sans text-sm font-bold text-muted-foreground">{closed.length}</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {closed.map((r) => (
                <li key={r.id}>
                  <ReportRow report={r} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
