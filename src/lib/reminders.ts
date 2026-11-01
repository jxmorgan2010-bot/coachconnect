import { prisma } from "@/lib/prisma";
import { queueEmail } from "@/lib/email";
import { reminderEmail } from "@/lib/emails";

type ReminderBooking = {
  scheduledAt: Date;
  locationText: string;
  parentProfile: { user: { email: string; name: string } };
  coachProfile: { user: { email: string; name: string } };
  child: { firstName: string } | null;
};

function sendReminders(b: ReminderBooking, kind: "TOMORROW" | "SOON") {
  const shared = {
    kind,
    coachName: b.coachProfile.user.name,
    parentName: b.parentProfile.user.name,
    childFirstName: b.child?.firstName ?? null,
    scheduledAt: b.scheduledAt,
    locationText: b.locationText,
  };
  queueEmail(reminderEmail({ to: b.parentProfile.user.email, audience: "PARENT", ...shared }));
  queueEmail(reminderEmail({ to: b.coachProfile.user.email, audience: "COACH", ...shared }));
}

const HOUR = 60 * 60 * 1000;

/**
 * Scans for CONFIRMED bookings approaching their 24h or 1h reminder
 * windows and "sends" (logs) a reminder to both parent and coach, marking
 * each window as sent so it never fires twice.
 *
 * There's no real job scheduler in this dev setup, so this is exposed as
 * POST /api/system/send-reminders (admin-triggerable, or wire up something
 * like Vercel Cron to hit it on a schedule in production).
 */
export async function runReminderSweep(now: Date = new Date()) {
  let sent24h = 0;
  let sent1h = 0;

  const due24h = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder24SentAt: null,
      scheduledAt: { gte: new Date(now.getTime() + 23 * HOUR), lte: new Date(now.getTime() + 25 * HOUR) },
    },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } }, child: true },
  });

  for (const b of due24h) {
    sendReminders(b, "TOMORROW");
    await prisma.booking.update({ where: { id: b.id }, data: { reminder24SentAt: now } });
    sent24h++;
  }

  const due1h = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder1hSentAt: null,
      scheduledAt: { gte: new Date(now.getTime() + 0.5 * HOUR), lte: new Date(now.getTime() + 1.5 * HOUR) },
    },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } }, child: true },
  });

  for (const b of due1h) {
    sendReminders(b, "SOON");
    await prisma.booking.update({ where: { id: b.id }, data: { reminder1hSentAt: now } });
    sent1h++;
  }

  return { sent24h, sent1h };
}
