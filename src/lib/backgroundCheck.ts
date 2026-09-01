/**
 * Mock Checkr-style background check integration.
 *
 * In production this would call the Checkr API and receive results via
 * webhook. For local/dev use we simulate the same lifecycle synchronously
 * so the rest of the app (status badges, admin gating) can be built and
 * tested against a realistic state machine.
 */

export function generateMockCheckRef(): string {
  return `mock_bgc_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Simulates Checkr's result. Deterministic-ish: overwhelmingly "clear" so
 * the happy path is easy to demo, with a small chance of "flagged" so the
 * admin flagged-review path can be exercised too.
 */
export function simulateBackgroundCheckResult(): "CLEAR" | "FLAGGED" {
  return Math.random() < 0.9 ? "CLEAR" : "FLAGGED";
}
