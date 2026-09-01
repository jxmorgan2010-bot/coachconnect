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
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="Write a message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
