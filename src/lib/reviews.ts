/** Reviews are public, so show "Dana R." rather than a parent's full name. */
export function reviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A parent";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : parts[0];
}

export type ReviewSummary = { count: number; average: number | null };

/** Average of real ratings only. No reviews means no average, never zero stars. */
export function summarizeReviews(ratings: number[]): ReviewSummary {
  if (ratings.length === 0) return { count: 0, average: null };
  return { count: ratings.length, average: ratings.reduce((sum, r) => sum + r, 0) / ratings.length };
}

/** "4.8", or "5.0" for a whole number, so every average reads the same way. */
export function formatAverage(average: number): string {
  return (Math.round(average * 10) / 10).toFixed(1);
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
