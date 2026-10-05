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

  const labelId = `rating-${bookingId}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-accent/10 p-3 sm:p-4">
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <p id={labelId} className="text-sm font-bold text-ink">Rate your session with {coachName}</p>
      <div role="radiogroup" aria-labelledby={labelId} className="-ml-1.5 flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className={`grid h-11 w-11 place-items-center rounded-md ${n <= rating ? "text-gold" : "text-muted-foreground"}`}
          >
            <IconStar className="h-7 w-7" />
          </button>
        ))}
      </div>
      <textarea
        aria-label="Comment (optional)"
        className={inputClass}
        rows={2}
        placeholder="Optional comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button type="submit" className={`${primaryButtonClass} w-full sm:w-auto sm:self-start`} disabled={loading}>
        {loading ? "Submitting..." : "Submit rating"}
      </button>
    </form>
  );
}
