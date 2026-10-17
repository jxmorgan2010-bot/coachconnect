"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MESSAGES_READ_EVENT, UNREAD_CHANGED_EVENT, type UnreadChange } from "@/lib/messageEvents";

/**
 * Keeps /messages and /messages/[id] current while they're open. The navbar does the polling;
 * this listens for its "unread changed" event and refreshes the server-rendered page.
 * On a thread page (threadId set) it also marks the thread read — on open, and again whenever
 * a new message arrives while it's on screen — so the badge never counts what you're reading.
 */
export default function MessagesLiveRefresh({ threadId }: { threadId?: string }) {
  const router = useRouter();

  useEffect(() => {
    async function markRead() {
      if (!threadId) return;
      const res = await fetch(`/api/threads/${threadId}/read`, { method: "POST" }).catch(() => null);
      if (res?.ok) window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
    }

    function onUnreadChanged(e: Event) {
      const { messages, previous } = (e as CustomEvent<UnreadChange>).detail;
      // On a thread, only a rise means something new to show; a drop is our own markRead.
      if (threadId && messages <= previous.messages) return;
      router.refresh();
      if (threadId) void markRead();
    }

    void markRead();
    window.addEventListener(UNREAD_CHANGED_EVENT, onUnreadChanged);
    return () => window.removeEventListener(UNREAD_CHANGED_EVENT, onUnreadChanged);
  }, [threadId, router]);

  return null;
}
