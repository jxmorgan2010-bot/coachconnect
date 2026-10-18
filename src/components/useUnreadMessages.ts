"use client";

import { useEffect, useRef, useState } from "react";
import {
  MESSAGES_READ_EVENT,
  UNREAD_CHANGED_EVENT,
  type UnreadChange,
  type UnreadCounts,
} from "@/lib/messageEvents";

const POLL_MS = 30_000;
const NONE: UnreadCounts = { threads: 0, messages: 0 };

/**
 * Unread message counts for the navbar. Checks on load, on every page change, when the tab
 * comes back into view, right after a thread is marked read, and every 30 seconds while the
 * tab is visible. Announces changes (UNREAD_CHANGED_EVENT) so an open messages page can refresh.
 */
export function useUnreadMessages(enabled: boolean, pathname: string): UnreadCounts {
  const [counts, setCounts] = useState<UnreadCounts>(NONE);
  const last = useRef<UnreadCounts | null>(null);

  useEffect(() => {
    if (!enabled) {
      last.current = null;
      return;
    }
    let cancelled = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/messages/unread", { cache: "no-store" }).catch(() => null);
      if (cancelled || !res?.ok) return;
      const next = (await res.json()) as UnreadCounts;
      if (cancelled) return;
      const previous = last.current;
      last.current = next;
      setCounts(next);
      if (previous && (previous.threads !== next.threads || previous.messages !== next.messages)) {
        window.dispatchEvent(new CustomEvent<UnreadChange>(UNREAD_CHANGED_EVENT, { detail: { ...next, previous } }));
      }
    }

    void check();
    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener(MESSAGES_READ_EVENT, check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener(MESSAGES_READ_EVENT, check);
    };
  }, [enabled, pathname]);

  return enabled ? counts : NONE;
}
