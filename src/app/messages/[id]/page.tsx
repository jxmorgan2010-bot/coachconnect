import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import ReportButton from "@/components/ReportButton";
import MessageComposer from "./MessageComposer";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session?.user) redirect(`/login?callbackUrl=/messages/${id}`);

  const thread = await prisma.thread.findUnique({
    where: { id },
    include: {
      parentProfile: { include: { user: true } },
      coachProfile: { include: { user: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: true } },
    },
  });
  if (!thread) notFound();

  const isParentSide = thread.parentProfile.userId === session.user.id;
  const isCoachSide = thread.coachProfile.userId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";
  if (!isParentSide && !isCoachSide && !isAdmin) notFound();

  const otherName = isParentSide ? thread.coachProfile.user.name : thread.parentProfile.user.name;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">{otherName}</h1>
        <ReportButton targetType="MESSAGE" targetId={thread.id} />
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Messages here never reveal phone numbers, emails, or addresses. Keep it in the app.
      </p>

      <div className="card mb-4 flex flex-col gap-3 p-4">
        {thread.messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No messages yet — say hello.</p>
        ) : (
          thread.messages.map((m) => {
            const mine = m.senderId === session.user.id;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg border-2 border-ink px-3 py-2 text-sm ${
                    mine ? "bg-pitch text-white" : "bg-muted text-ink"
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  {m.sender.name} &middot; {m.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            );
          })
        )}
      </div>

      <MessageComposer threadId={thread.id} />
    </div>
  );
}
