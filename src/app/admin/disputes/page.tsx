import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AdminNav from "../AdminNav";
import DisputeRow from "./DisputeRow";

export default async function AdminDisputesPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/disputes");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const disputes = await prisma.dispute.findMany({
    include: {
      booking: true,
      parentProfile: { include: { user: true } },
      coachProfile: { include: { user: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-2xl font-extrabold text-secondary">Admin</h1>
      <p className="mb-6 text-muted-foreground">
        Parents can flag a completed session as a problem. Issue a refund, side with the coach, or ask both sides
        for more info.
      </p>
      <AdminNav />

      {disputes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No disputes yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((d) => (
            <DisputeRow
              key={d.id}
              dispute={{
                id: d.id,
                parentName: d.parentProfile.user.name,
                coachName: d.coachProfile.user.name,
                sessionDate: d.booking.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                sessionPriceCents: d.booking.priceCents,
                reason: d.reason,
                details: d.details,
                status: d.status,
                refundCents: d.refundCents,
                adminNote: d.adminNote,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
