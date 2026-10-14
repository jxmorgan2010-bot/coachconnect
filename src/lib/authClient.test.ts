import { test } from "node:test";
import assert from "node:assert/strict";
import { isCsrfRejection, safeCallbackPath } from "./authClient";

test("recognises NextAuth's CSRF rejection URL, whatever host NEXTAUTH_URL gives it", () => {
  assert.equal(isCsrfRejection("http://localhost:3000/api/auth/signin?csrf=true"), true);
  assert.equal(isCsrfRejection("https://coachconnect-nine.vercel.app/api/auth/signin?csrf=true"), true);
  assert.equal(isCsrfRejection("/api/auth/signout?csrf=true"), true);
});

test("a normal sign-in result isn't a CSRF rejection", () => {
  assert.equal(isCsrfRejection("http://localhost:3000/login"), false);
  assert.equal(isCsrfRejection("http://localhost:3000/api/auth/error?error=CredentialsSignin"), false);
  assert.equal(isCsrfRejection(null), false);
  assert.equal(isCsrfRejection(undefined), false);
  assert.equal(isCsrfRejection(""), false);
});

test("callback URLs must be paths on this site", () => {
  assert.equal(safeCallbackPath("/onboarding/coach", "/dashboard"), "/onboarding/coach");
  assert.equal(safeCallbackPath("/coaches?sport=SOCCER", "/dashboard"), "/coaches?sport=SOCCER");
  assert.equal(safeCallbackPath(null, "/dashboard"), "/dashboard");
  assert.equal(safeCallbackPath("", "/dashboard"), "/dashboard");
  assert.equal(safeCallbackPath("https://example.com", "/dashboard"), "/dashboard");
  assert.equal(safeCallbackPath("//example.com/path", "/dashboard"), "/dashboard");
  assert.equal(safeCallbackPath("/\\example.com", "/dashboard"), "/dashboard");
  assert.equal(safeCallbackPath("javascript:alert(1)", "/dashboard"), "/dashboard");
});
