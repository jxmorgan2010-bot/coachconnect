import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AdminNav from "../AdminNav";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-2xl font-extrabold text-secondary">Admin</h1>
      <p className="mb-6 text-muted-foreground">
        Reports on coach profiles and message threads. A coach is auto-suspended once they hit 3 open reports.
      </p>
      <AdminNav />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
