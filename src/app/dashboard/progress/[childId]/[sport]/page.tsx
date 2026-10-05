import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isSport, SPORT_LABELS } from "@/lib/sports";
import Link from "next/link";
import TrainingPlanChecklist from "@/components/TrainingPlanChecklist";
import SportPill from "@/components/SportPill";
import { quietLinkClass } from "@/lib/ui";
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
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
      <Link href={isParent ? "/dashboard/family" : "/dashboard"} className={`${quietLinkClass} -ml-1 mb-2 text-pitch`}>
        ← {isParent ? "Your family" : "Dashboard"}
      </Link>
      <p className="eyebrow mb-2 flex items-center gap-2 text-pitch">
        <SportPill sport={sport} /> Progress
      </p>
      <h1 className="text-display-lg font-display text-ink">
        {child.firstName} — {SPORT_LABELS[sport]}
      </h1>
      <p className="mt-2 mb-8 text-muted-foreground">Training plan and every progress note, newest first.</p>

      <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="plan">
          <h2 id="plan" className="mb-3 font-display text-3xl text-ink">Training plan</h2>
          <div className="card p-4">
            <TrainingPlanChecklist
              childId={childId}
              sport={sport}
              items={trainingPlanItems.map((i) => ({ id: i.id, label: i.label, isDone: i.isDone }))}
              canAdd={!!coachProfileId}
            />
          </div>
        </section>

        <section aria-labelledby="notes">
          <h2 id="notes" className="mb-3 font-display text-3xl text-ink">Progress notes</h2>
          {notes.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-muted-foreground">
              No progress notes yet. Coaches add one after a completed session.
            </p>
          ) : (
            <ol className="flex flex-col gap-5 border-l-4 border-gold pl-4">
              {notes.map((b) => (
                <li key={b.id}>
                  <p className="text-xs font-bold text-muted-foreground">
                    {b.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} with{" "}
                    {b.coachProfile.user.name}
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
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
