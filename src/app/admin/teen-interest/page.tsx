import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AdminHeader from "@/components/AdminHeader";
import Badge from "@/components/Badge";
import { describeCalendarDate, parseCalendarDate, storedDateToCalendarDate, todayInPacific } from "@/lib/age";
import { toPacificParts } from "@/lib/availability";
import { hasTurned18, sportLabels } from "@/lib/teenInterest";
import { secondaryButtonClass } from "@/lib/ui";
import ContactedCheckbox from "./ContactedCheckbox";

type Entry = {
  id: string;
  createdAt: Date;
  firstName: string;
  email: string;
  sports: string;
  school: string;
  gradYear: number;
  parentEmail: string | null;
  turns18On: Date;
  contactedAt: Date | null;
};

const turns18Text = (e: Entry) => describeCalendarDate(storedDateToCalendarDate(e.turns18On));
/** "December 1, 2025": the list spans years, so always with the year (Pacific date). */
const pacificDate = (d: Date) => describeCalendarDate(parseCalendarDate(toPacificParts(d).date)!);

function EntryCard({ e, adult }: { e: Entry; adult: boolean }) {
  return (
    <li className={`flex flex-col gap-3 p-4 sm:p-5 ${adult ? "card border-ink bg-accent/15" : "card-flat"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-2xl leading-none text-ink">{e.firstName}</p>
        {adult ? (
          <Badge variant="accent">Turned 18 on {turns18Text(e)}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Turns 18 on {turns18Text(e)}</span>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0">
          <dt className="font-bold text-ink">Email</dt>
          <dd className="break-words text-ink">{e.email}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold text-ink">Sports</dt>
          <dd className="text-ink">{sportLabels(e.sports) || "None given"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold text-ink">School</dt>
          <dd className="break-words text-ink">
            {e.school} · class of {e.gradYear}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold text-ink">Parent or guardian</dt>
          <dd className="break-words text-ink">{e.parentEmail ?? <span className="text-muted-foreground">Not given</span>}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold text-ink">Joined</dt>
          <dd className="text-ink">{pacificDate(e.createdAt)}</dd>
        </div>
      </dl>
      <ContactedCheckbox id={e.id} contactedAt={e.contactedAt ? pacificDate(e.contactedAt) : null} />
    </li>
  );
}

function SectionTitle({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <h2 id={id} className="mb-3 font-display text-3xl text-ink">
      {title} <span className="ml-1 font-sans text-sm font-bold text-muted-foreground">{count}</span>
    </h2>
  );
}

export default async function AdminTeenInterestPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/teen-interest");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const entries = await prisma.teenInterestEntry.findMany({ orderBy: { createdAt: "desc" } });
  const today = todayInPacific();
  // Longest-18 first: they've waited the longest since they could sign up.
  const adults = entries.filter((e) => hasTurned18(e.turns18On, today)).sort((a, b) => a.turns18On.getTime() - b.turns18On.getTime());
  const teens = entries.filter((e) => !hasTurned18(e.turns18On, today));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Teen interest list">
        16- and 17-year-olds who tried coach signup while coaches must be 18 or older. No accounts. Parent or
        guardian emails are kept but never emailed.
      </AdminHeader>

      {entries.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
          No one has joined the teen interest list yet.
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} · {entries.filter((e) => e.contactedAt).length} contacted
            </p>
            {/* A plain link: the route answers with a file download */}
            <a href="/api/admin/teen-interest/export" className={secondaryButtonClass} download>
              Export CSV
            </a>
          </div>

          {adults.length > 0 && (
            <section aria-labelledby="now-18">
              <SectionTitle id="now-18" title="Now 18: invite as a regular coach" count={adults.length} />
              <ul className="flex flex-col gap-3">
                {adults.map((e) => (
                  <EntryCard key={e.id} e={e} adult />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="under-18">
            <SectionTitle id="under-18" title="Under 18" count={teens.length} />
            {teens.length === 0 ? (
              <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
                Everyone on the list has turned 18.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {teens.map((e) => (
                  <EntryCard key={e.id} e={e} adult={false} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
