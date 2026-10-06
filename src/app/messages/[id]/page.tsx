import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import ReportButton from "@/components/ReportButton";
import Link from "next/link";
import MessageComposer from "./MessageComposer";
import { CONTACT_RULE_TEXT, ACCOUNT_SUSPENDED_MESSAGE } from "@/lib/contactRule";
import { quietLinkClass } from "@/lib/ui";

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
  const viewer = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isSuspended: true } });
  const viewerSuspended = Boolean(viewer?.isSuspended);

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-8 sm:px-6 md:py-12">
      <Link href="/messages" className={`${quietLinkClass} -ml-1 mb-1 self-start text-pitch`}>
        ← All messages
      </Link>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-display-lg font-display text-ink">{otherName}</h1>
        <ReportButton targetType="MESSAGE" targetId={thread.id} variant="quiet" />
      </div>
      {/* The rule is enforced server-side when a message is sent (src/lib/contactPolicy.ts) */}
      <p className="mb-4 rounded-lg border-2 border-line bg-chalk px-3 py-2 text-sm text-ink">{CONTACT_RULE_TEXT}</p>

      <div role="log" aria-label={`Conversation with ${otherName}`} className="card mb-4 flex flex-col gap-4 p-4 sm:p-5">
        {thread.messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet — say hello.</p>
        ) : (
          thread.messages.map((m) => {
            const mine = m.senderId === session.user.id;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-line break-words rounded-xl border-2 border-ink px-3.5 py-2.5 text-[15px] leading-snug ${
                    mine ? "rounded-br-sm bg-pitch text-white" : "rounded-bl-sm bg-muted text-ink"
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-1 text-xs text-muted-foreground">
                  {mine ? "You" : m.sender.name} &middot;{" "}
                  <time dateTime={m.createdAt.toISOString()}>
                    {m.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </time>
                </span>
              </div>
            );
          })
        )}
      </div>

      {viewerSuspended ? (
        <p role="status" className="rounded-lg border-2 border-danger bg-danger/10 px-3.5 py-3 text-sm font-bold text-danger">
          {ACCOUNT_SUSPENDED_MESSAGE}
        </p>
      ) : (
        <MessageComposer threadId={thread.id} />
      )}
    </div>
  );
}
