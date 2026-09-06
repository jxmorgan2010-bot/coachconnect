/** True when [aStart, aStart+aDuration) and [bStart, bStart+bDuration) overlap at all. */
export function rangesOverlap(aStart: Date, aDurationMinutes: number, bStart: Date, bDurationMinutes: number): boolean {
  const aStartMs = aStart.getTime();
  const aEndMs = aStartMs + aDurationMinutes * 60_000;
  const bStartMs = bStart.getTime();
  const bEndMs = bStartMs + bDurationMinutes * 60_000;
  return aStartMs < bEndMs && bStartMs < aEndMs;
}
