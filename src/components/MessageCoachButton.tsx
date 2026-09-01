"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { IconMessage } from "@/components/icons";
import { secondaryButtonClass } from "@/lib/ui";

export default function MessageCoachButton({ coachProfileId }: { coachProfileId: string }) {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachProfileId }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      router.push(`/messages/${data.threadId}`);
    }
  }

  return (
    <button type="button" onClick={onClick} className={secondaryButtonClass} disabled={loading}>
      <IconMessage className="h-4 w-4" /> {loading ? "Opening..." : "Message coach"}
    </button>
  );
}
