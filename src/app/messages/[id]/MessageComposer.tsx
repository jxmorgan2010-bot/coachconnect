"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, primaryButtonClass, errorClass } from "@/lib/ui";

export default function MessageComposer({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      // Second strike: reload so the suspension banner and locked composer show.
      if (data.code === "ACCOUNT_SUSPENDED") router.refresh();
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div className="flex gap-2">
        <input
          aria-label="Message"
          enterKeyHint="send"
          autoComplete="off"
          className={`${inputClass} min-w-0 flex-1`}
          placeholder="Write a message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button type="submit" className={`${primaryButtonClass} shrink-0`} disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
