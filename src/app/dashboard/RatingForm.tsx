"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconStar } from "@/components/icons";
import { inputClass, primaryButtonClass, errorClass } from "@/lib/ui";

export default function RatingForm({ bookingId, coachName }: { bookingId: string; coachName: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-accent/10 p-3">
      {error && <p className={errorClass}>{error}</p>}
      <p className="text-sm font-bold text-ink">Rate your session with {coachName}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} stars`}
            className={n <= rating ? "text-gold" : "text-muted-foreground"}
          >
            <IconStar className="h-6 w-6" />
          </button>
        ))}
      </div>
      <textarea
        className={inputClass}
        rows={2}
        placeholder="Optional comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button type="submit" className={`${primaryButtonClass} self-start`} disabled={loading}>
        {loading ? "Submitting..." : "Submit rating"}
      </button>
    </form>
  );
}
