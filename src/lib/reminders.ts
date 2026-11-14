import { prisma } from "@/lib/prisma";
import { sendEmail, withRetry } from "@/lib/email";
import { reminderEmail } from "@/lib/emails";
import type { JobLog } from "@/lib/jobs/runLog";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const BATCH = 200;

/**
 * Reminders to the parent and the coach 24 hours and 1 hour before each CONFIRMED session
 * (cancelled and completed ones are skipped). The windows are wider than the job's 30-minute
 * schedule so a late or skipped run still sends them: "tomorrow" from 25 down to 22 hours
 * before (six runs), "soon" from 75 down to 10 minutes before (at least two runs, so it normally
 * goes out 45 to 75 minutes before).
 *
 * Safe to run twice: each reminder is claimed (reminder24SentAt / reminder1hSentAt) with a guarded
 * update before it's sent, so it goes out at most once even if two runs overlap.
 */
const WINDOWS = [
  { kind: "TOMORROW", field: "reminder24SentAt", from: 22 * HOUR, to: 25 * HOUR, label: "24-hour reminders sent" },
  { kind: "SOON", field: "reminder1hSentAt", from: 10 * MINUTE, to: 75 * MINUTE, label: "1-hour reminders sent" },
] as const;

export async function runRemindersJob(log: JobLog, now: Date) {
  for (const w of WINDOWS) {
    const due = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        [w.field]: null,
        scheduledAt: { gt: new Date(now.getTime() + w.from), lte: new Date(now.getTime() + w.to) },
      },
      include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } }, child: true },
      take: BATCH,
    });

    await log.each(due, async (b) => {
      const { count } = await prisma.booking.updateMany({
        where: { id: b.id, status: "CONFIRMED", [w.field]: null },
        data: { [w.field]: now },
      });
      if (count !== 1) return;

      const shared = {
        kind: w.kind,
        coachName: b.coachProfile.user.name,
        parentName: b.parentProfile.user.name,
        childFirstName: b.child?.firstName ?? null,
        scheduledAt: b.scheduledAt,
        locationText: b.locationText,
      };
      const params = { kind: w.kind };
      const parent = await sendEmail(
        withRetry(reminderEmail({ to: b.parentProfile.user.email, audience: "PARENT", ...shared }), { kind: "REMINDER_PARENT", ref: b.id, params }),
      );
      const coach = await sendEmail(
        withRetry(reminderEmail({ to: b.coachProfile.user.email, audience: "COACH", ...shared }), { kind: "REMINDER_COACH", ref: b.id, params }),
      );
      if (parent.status === "failed" || coach.status === "failed") {
        log.fail(`booking ${b.id}`, "a reminder email wasn't sent");
        return;
      }
      log.ok(w.label);
    });
  }
}
