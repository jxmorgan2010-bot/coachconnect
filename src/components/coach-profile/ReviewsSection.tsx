import Stars from "./Stars";
import { formatAverage, pluralize, summarizeReviews } from "@/lib/reviews";

export type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  /** Already shortened to first name + last initial (see reviewerName). */
  reviewer: string;
  createdAt: Date;
};

const SHOWN_FIRST = 5;

function ReviewRow({ review }: { review: ReviewItem }) {
  return (
    <li className="border-b-2 border-line py-4 first:pt-0 last:border-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stars rating={review.rating} label={`${review.rating} out of 5 stars`} />
        <span className="text-xs font-bold text-ink">{review.reviewer}</span>
        <span className="text-xs text-muted-foreground">
          {review.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Los_Angeles" })}
        </span>
      </div>
      {review.comment && <p className="mt-1.5 max-w-prose text-sm text-ink/85">{review.comment}</p>}
    </li>
  );
}

/** Rating summary, completed sessions and the review list. Every number comes from real bookings and reviews. */
export default function ReviewsSection({
  firstName,
  reviews,
  sessionsCompleted,
  headingId = "reviews",
}: {
  firstName: string;
  /** Newest first. */
  reviews: ReviewItem[];
  sessionsCompleted: number;
  headingId?: string;
}) {
  const { count, average } = summarizeReviews(reviews.map((r) => r.rating));
  const sessions = pluralize(sessionsCompleted, "completed session");

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 font-display text-3xl text-ink">Reviews</h2>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-2 border-ink bg-surface px-4 py-3">
        {average !== null ? (
          <>
            <span className="font-display text-4xl leading-none text-ink">{formatAverage(average)}</span>
            <span className="flex flex-col gap-1">
              <Stars rating={average} size="h-5 w-5" label={`Average ${formatAverage(average)} out of 5 stars`} />
              <span className="text-sm font-bold text-muted-foreground">
                {pluralize(count, "review")} · {sessions}
              </span>
            </span>
          </>
        ) : (
          <span className="flex flex-col gap-0.5">
            <span className="font-bold text-ink">New coach, no reviews yet</span>
            <span className="text-sm text-muted-foreground">
              {sessionsCompleted > 0 ? `${sessions}. ` : ""}Families can review {firstName} after a completed session.
            </span>
          </span>
        )}
      </div>

      {count > 0 && (
        <>
          <ul className="flex flex-col">
            {reviews.slice(0, SHOWN_FIRST).map((review) => (
              <ReviewRow key={review.id} review={review} />
            ))}
          </ul>
          {count > SHOWN_FIRST && (
            <details className="group mt-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold text-pitch underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show all {count} reviews</span>
                <span className="hidden group-open:inline">Show fewer reviews</span>
              </summary>
              <ul className="mt-2 flex flex-col border-t-2 border-line pt-4">
                {reviews.slice(SHOWN_FIRST).map((review) => (
                  <ReviewRow key={review.id} review={review} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
