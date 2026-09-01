import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

export default async function MessagesPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/messages");
  if (session.user.role !== "PARENT" && session.user.role !== "COACH") redirect("/dashboard");

  let rows: { id: string; otherName: string; lastMessage: string | null }[] = [];

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
    }));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-3xl text-ink">Messages</h1>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground">
          No conversations yet.{" "}
          {session.user.role === "PARENT"
            ? "Message a coach from their profile to get started."
            : "Parents will reach out here once they message you."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/messages/${row.id}`}
              className="press flex items-center justify-between gap-3 rounded-lg border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--ink)]"
            >
              <div>
                <p className="font-display text-lg text-ink">{row.otherName}</p>
                <p className="line-clamp-1 text-sm text-muted-foreground">{row.lastMessage ?? "No messages yet — say hello."}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
