import { signIn, signOut } from "next-auth/react";

/**
 * Browser-side sign-in and sign-out that never report success unless it really happened.
 *
 * Why the retry: NextAuth guards both with a CSRF token stored in a cookie. Any auth request that
 * arrives without that cookie mints a new token, so on a first visit the page's own session check
 * (/api/auth/session) and sign-in's token request (/api/auth/csrf) can each mint one. If the
 * session check's reply lands mid sign-in, it replaces the cookie and NextAuth rejects the attempt.
 * It answers that rejection with HTTP 200 and a `?csrf=true` URL rather than an error, which
 * `signIn()` passes back as `ok: true, error: null`. After a rejection the browser holds a single
 * valid token and nothing is left to replace it, so one retry succeeds.
 */

export type SignInResult = { ok: true } | { ok: false; error: string };

export const SIGN_IN_ERRORS = {
  invalid: "Invalid email or password.",
  rejected: "We couldn't sign you in just now. Refresh the page and try again.",
  network: "We couldn't reach CoachConnect. Check your connection and try again.",
} as const;

/** True when NextAuth sent us back to its own page because the CSRF check failed. */
export function isCsrfRejection(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url, "http://placeholder").searchParams.get("csrf") === "true";
  } catch {
    return false;
  }
}

/**
 * Only follow callback URLs that are paths on this site, so a crafted link can't send someone
 * to another site after they sign in.
 */
export function safeCallbackPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/**
 * Asks the server whether there's a session: true or false, or null if we couldn't tell.
 * (next-auth's getSession() returns null for both "signed out" and "request failed".)
 */
async function hasServerSession(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: unknown };
    return Boolean(data?.user);
  } catch {
    return null;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await signIn("credentials", { redirect: false, email, password });
    } catch {
      return { ok: false, error: SIGN_IN_ERRORS.network };
    }
    if (!res) return { ok: false, error: SIGN_IN_ERRORS.rejected };
    if (res.error === "CredentialsSignin") return { ok: false, error: SIGN_IN_ERRORS.invalid };
    if (res.error) return { ok: false, error: SIGN_IN_ERRORS.rejected };
    if (isCsrfRejection(res.url)) continue;
    if (!res.ok) return { ok: false, error: SIGN_IN_ERRORS.rejected };

    // Belt and braces: only call it a success once the server confirms the session.
    const signedIn = await hasServerSession();
    if (signedIn) return { ok: true };
    return { ok: false, error: signedIn === null ? SIGN_IN_ERRORS.network : SIGN_IN_ERRORS.rejected };
  }
  return { ok: false, error: SIGN_IN_ERRORS.rejected };
}

/**
 * Signs out, confirms the session is gone, then reloads the home page on the current site. The
 * full reload clears any signed-in page state, and staying on the current host means sign-out
 * doesn't depend on NEXTAUTH_URL (a preview deployment won't bounce to the production domain).
 * Returns false if the session is still there after a retry.
 */
export async function signOutToHome(): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await signOut({ redirect: false });
    } catch {
      // Fall through to the session check: it decides whether we're signed out.
    }
    if ((await hasServerSession()) === false) {
      // A full load on purpose: router.push would keep signed-in pages in the client router cache.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
      return true;
    }
  }
  return false;
}
