import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { SPORT_LABELS } from "@/lib/sports";
import BarList from "@/components/BarList";
import AdminNav from "../AdminNav";
import ReminderSweepButton from "./ReminderSweepButton";

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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-2xl font-extrabold text-secondary">Admin</h1>
      <p className="mb-6 text-muted-foreground">Booking activity, revenue, and regional demand (based on confirmed and completed sessions).</p>
      <AdminNav />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-bold text-muted-foreground">Total bookings</p>
          <p className="font-display text-3xl text-ink">{totalBookings}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold text-muted-foreground">Total revenue (net of credits)</p>
          <p className="font-display text-3xl text-ink">{formatCents(totalRevenueCents)}</p>
        </div>
        <div className="card p-5">
          <p className="mb-2 text-xs font-bold text-muted-foreground">Reminder sweep</p>
          <ReminderSweepButton />
        </div>
      </div>

      <section className="card mb-6 p-5">
        <h2 className="mb-4 font-display text-xl text-ink">Bookings per sport</h2>
        {sportItems.length === 0 ? <p className="text-sm text-muted-foreground">No bookings yet.</p> : <BarList items={sportItems} />}
      </section>

      <section className="card mb-6 p-5">
        <h2 className="mb-4 font-display text-xl text-ink">Revenue over time</h2>
        {monthItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <BarList items={monthItems} formatValue={(v) => formatCents(v)} />
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-display text-xl text-ink">Most active regions</h2>
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
  );
}
