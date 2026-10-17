// Browser events that keep the navbar's unread badge and the open messages page in step,
// without a page reload. Safe to import from client components.

export type UnreadCounts = { threads: number; messages: number };

/** Fired by a thread page after it marks the thread read, so the navbar re-checks at once. */
export const MESSAGES_READ_EVENT = "coachconnect:messages-read";

/** Fired by the navbar when a poll finds different counts than the last one. */
export const UNREAD_CHANGED_EVENT = "coachconnect:unread-changed";
export type UnreadChange = UnreadCounts & { previous: UnreadCounts };
