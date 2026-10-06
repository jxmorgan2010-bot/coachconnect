"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryButtonClass, errorClass } from "@/lib/ui";

export default function ModerationActions({
  userId,
  name,
  isSuspended,
}: {
  userId: string;
  name: string;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "reverse_suspension" | "clear_strikes") {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/admin/users/${userId}/moderation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div role="group" aria-label={`Moderation actions for ${name}`} className="flex flex-col gap-2">
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div className="flex flex-wrap gap-2">
        {isSuspended && (
          <button onClick={() => act("reverse_suspension")} disabled={loading} className={secondaryButtonClass}>
            Reverse suspension
          </button>
        )}
        <button onClick={() => act("clear_strikes")} disabled={loading} className={secondaryButtonClass}>
          Clear all strikes
        </button>
      </div>
    </div>
  );
}
