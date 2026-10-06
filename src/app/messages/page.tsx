import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { secondaryButtonClass } from "@/lib/ui";

export default async function MessagesPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/messages");
  if (session.user.role !== "PARENT" && session.user.role !== "COACH") redirect("/dashboard");

  let rows: { id: string; otherName: string; lastMessage: string | null; lastAt: Date | null }[] = [];

  if (session.user.role === "PARENT") {
    const threads = await prisma.thread.findMany({
      where: { parentProfile: { userId: session.user.id } },
      include: {
        coachProfile: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    rows = threads.map((t) => ({
      id: t.id,
      otherName: t.coachProfile.user.name,
      lastMessage: t.messages[0]?.body ?? null,
      lastAt: t.messages[0]?.createdAt ?? null,
    }));
  } else {
    const threads = await prisma.thread.findMany({
      where: { coachProfile: { userId: session.user.id } },
      include: {
        parentProfile: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    rows = threads.map((t) => ({
      id: t.id,
      otherName: t.parentProfile.user.name,
      lastMessage: t.messages[0]?.body ?? null,
      lastAt: t.messages[0]?.createdAt ?? null,
    }));
  }

  // Most recent conversation first; threads with no messages yet sink to the bottom.
  rows.sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:py-12">
      <p className="eyebrow mb-2 text-pitch">{session.user.role === "PARENT" ? "Parent" : "Coach"}</p>
      <h1 className="text-display-lg mb-6 font-display text-ink">Messages</h1>

      {rows.length === 0 ? (
        <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
          <h2 className="text-display-md font-display text-ink">No conversations yet</h2>
          <p className="text-muted-foreground">
            {session.user.role === "PARENT"
              ? "Open a coach's profile and tap “Message coach” to ask about times, location, or what a session looks like."
              : "When a parent messages you from your profile, the conversation shows up here."}
          </p>
          {session.user.role === "PARENT" && (
            <Link href="/coaches" className={secondaryButtonClass}>See coaches near you</Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border-2 border-ink bg-surface shadow-patch">
          {rows.map((row, i) => (
            <li key={row.id} className={i > 0 ? "border-t-2 border-line" : ""}>
              <Link href={`/messages/${row.id}`} className="flex min-h-16 items-center gap-4 p-4 hover:bg-chalk">
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-gold font-display text-lg text-ink"
                >
                  {row.otherName.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-display text-xl leading-tight text-ink">{row.otherName}</p>
                    {row.lastAt && (
                      <time dateTime={row.lastAt.toISOString()} className="shrink-0 text-xs text-muted-foreground">
                        {row.lastAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </time>
                    )}
                  </div>
                  <p className="line-clamp-1 text-sm text-muted-foreground">{row.lastMessage ?? "No messages yet — say hello."}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
