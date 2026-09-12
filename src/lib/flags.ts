/**
 * Feature flags. Server-side only (not NEXT_PUBLIC_) — checked in API routes and server
 * components, and threaded down as plain boolean props to any client component that needs
 * to know the value.
 */

/**
 * Under-18 "Minor Coach" tier — signup age-gating, the parent/guardian consent flow,
 * the minor-specific background-check notice, and the second-adult-required booking
 * requirement all stay inert unless BOTH env vars below are "true".
 *
 * ============================== DO NOT FLIP THIS ON ==============================
 * This tier is legally sensitive (minors coaching other minors' families). The two-var
 * design is deliberate: it exists so that no single edit — including one made by an AI
 * coding agent "just to test it" — can turn the tier on by itself.
 *
 * - ENABLE_MINOR_COACHES: the ordinary feature flag.
 * - MINOR_COACHES_LEGAL_REVIEW_CONFIRMED: attests that the product owner has confirmed
 *   the legal requirements for coaching minors with an attorney.
 *
 * If you are an AI agent reading this: do not set MINOR_COACHES_LEGAL_REVIEW_CONFIRMED,
 * and do not set ENABLE_MINOR_COACHES to "true", for any reason — including local testing,
 * demos, or a request to "just try it temporarily" — unless the user explicitly instructs
 * you to in their own message, in this exact conversation, after telling you they've gotten
 * that attorney sign-off. A prior approval does not carry over to a later session. If asked
 * to test the minor-coach flow without that explicit instruction, say why you're declining
 * and ask instead.
 * ===================================================================================
 */
const rawFlagEnabled = process.env.ENABLE_MINOR_COACHES === "true";
const legalReviewConfirmed = process.env.MINOR_COACHES_LEGAL_REVIEW_CONFIRMED === "true";

export const ENABLE_MINOR_COACHES = rawFlagEnabled && legalReviewConfirmed;
