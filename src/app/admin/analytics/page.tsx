import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { SPORT_LABELS } from "@/lib/sports";
import BarList from "@/components/BarList";
import AdminHeader from "@/components/AdminHeader";
import ReminderSweepButton from "./ReminderSweepButton";
import AutoReleaseSweepButton from "./AutoReleaseSweepButton";

export default async function AdminAnalyticsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/analytics");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
    include: { coachProfile: { select: { zip: true, city: true, state: true } } },
  });

  const bySport = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const byRegion = new Map<string, number>();

  for (const b of bookings) {
    bySport.set(b.sport, (bySport.get(b.sport) ?? 0) + 1);

    const monthKey = b.scheduledAt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const netCents = b.priceCents - b.discountCents;
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + netCents);

    const region = b.coachProfile.zip
      ? `${b.coachProfile.city}, ${b.coachProfile.state} ${b.coachProfile.zip}`
      : `${b.coachProfile.city ?? "Unknown"}, ${b.coachProfile.state ?? ""}`;
    byRegion.set(region, (byRegion.get(region) ?? 0) + 1);
  }

  const totalRevenueCents = Array.from(byMonth.values()).reduce((s, v) => s + v, 0);
  const totalBookings = bookings.length;

  const sportItems = Array.from(bySport.entries())
    .map(([sport, count]) => ({ label: SPORT_LABELS[sport as keyof typeof SPORT_LABELS] ?? sport, value: count }))
    .sort((a, b) => b.value - a.value);

  const monthItems = Array.from(byMonth.entries())
    .map(([label, cents]) => ({ label, value: cents }))
    .sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime());

  const regionItems = Array.from(byRegion.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Analytics">
        Bookings, booked value, and regional demand, from confirmed and completed sessions only.
      </AdminHeader>

      {/* Two real headline numbers, straight from the bookings table */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="eyebrow text-muted-foreground">Bookings</p>
          <p className="mt-2 font-display text-5xl leading-none text-ink">{totalBookings.toLocaleString("en-US")}</p>
          <p className="mt-1 text-sm text-muted-foreground">Confirmed + completed</p>
        </div>
        <div className="card p-5">
          <p className="eyebrow text-muted-foreground">Booked value</p>
          <p className="mt-2 font-display text-5xl leading-none text-ink">{formatCents(totalRevenueCents)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Session prices, net of referral credits</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="by-sport" className="card-flat p-5">
          <h2 id="by-sport" className="mb-4 font-display text-2xl leading-none text-ink">Bookings per sport</h2>
          {sportItems.length === 0 ? <p className="text-sm text-muted-foreground">No bookings yet.</p> : <BarList items={sportItems} />}
        </section>

        <section aria-labelledby="by-month" className="card-flat p-5">
          <h2 id="by-month" className="mb-4 font-display text-2xl leading-none text-ink">Booked value by month</h2>
          {monthItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <BarList items={monthItems} formatValue={(v) => formatCents(v)} />
          )}
        </section>

        <section aria-labelledby="by-region" className="card-flat p-5 lg:col-span-2">
          <h2 id="by-region" className="mb-4 font-display text-2xl leading-none text-ink">Most active regions</h2>
          {regionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <BarList items={regionItems} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Based on each session&apos;s coach location (zip/city/state) — we don&apos;t collect the family&apos;s
            address.
          </p>
        </section>
      </div>

      <section aria-labelledby="sweeps" className="mt-10">
        <h2 id="sweeps" className="mb-1 font-display text-3xl text-ink">Manual jobs</h2>
        <p className="mb-4 text-sm text-muted-foreground">There&apos;s no scheduler yet, so these run when you press the button.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card-flat p-5">
            <p className="mb-3 font-bold text-ink">Session reminders</p>
            <ReminderSweepButton />
          </div>
          <div className="card-flat p-5">
            <p className="mb-3 font-bold text-ink">Payment auto-release</p>
            <AutoReleaseSweepButton />
          </div>
        </div>
      </section>
    </div>
  );
}
