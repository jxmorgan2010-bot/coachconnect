import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isSport, SPORT_LABELS } from "@/lib/sports";
import TrainingPlanChecklist from "@/components/TrainingPlanChecklist";
import type { Sport } from "@/generated/prisma/client";

export default async function ProgressHistoryPage({
  params,
}: {
  params: Promise<{ childId: string; sport: string }>;
}) {
  const { childId, sport: sportParam } = await params;
  if (!isSport(sportParam)) notFound();
  const sport = sportParam as Sport;

  const session = await getCurrentSession();
  if (!session?.user) redirect(`/login?callbackUrl=/dashboard/progress/${childId}/${sport}`);

  const child = await prisma.child.findUnique({ where: { id: childId }, include: { parentProfile: true } });
  if (!child) notFound();

  const isParent = session.user.role === "PARENT" && child.parentProfile.userId === session.user.id;
  let coachProfileId: string | null = null;
  if (session.user.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: session.user.id } });
    if (coachProfile) {
      const hasTaught = await prisma.booking.count({
        where: { coachProfileId: coachProfile.id, childId, sport, status: { in: ["CONFIRMED", "COMPLETED"] } },
      });
      if (hasTaught) coachProfileId = coachProfile.id;
    }
  }
  if (!isParent && !coachProfileId) redirect("/dashboard");

  const [notes, trainingPlanItems] = await Promise.all([
    prisma.booking.findMany({
      where: { childId, sport, status: "COMPLETED", progressNoteAddedAt: { not: null } },
      include: { coachProfile: { include: { user: true } } },
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.trainingPlanItem.findMany({
      where: { childId, sport, ...(coachProfileId ? { coachProfileId } : {}) },
      orderBy: { order: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl text-ink">{child.firstName} — {SPORT_LABELS[sport]}</h1>
      <p className="mb-6 text-muted-foreground">Full progress history and training plan.</p>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-2xl text-ink">Training plan</h2>
        <div className="card p-4">
          <TrainingPlanChecklist
            childId={childId}
            sport={sport}
            items={trainingPlanItems.map((i) => ({ id: i.id, label: i.label, isDone: i.isDone }))}
            canAdd={!!coachProfileId}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl text-ink">Progress notes</h2>
        {notes.length === 0 ? (
          <p className="text-muted-foreground">No progress notes yet.</p>
        ) : (
          <div className="flex flex-col divide-y-2 divide-line rounded-lg border-2 border-ink">
            {notes.map((b) => (
              <div key={b.id} className="p-3">
                <p className="text-xs font-bold text-muted-foreground">
                  {b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} with {b.coachProfile.user.name}
                </p>
                <p className="mt-1 text-sm text-ink">
                  <span className="font-bold">Worked on: </span>
                  {b.progressWhatWorkedOn}
                </p>
                {b.progressNextFocus && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-bold">Next focus: </span>
                    {b.progressNextFocus}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
