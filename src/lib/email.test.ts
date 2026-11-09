import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { canDeliverTo, firstName, renderHtml, renderText, safeText, sendEmail, type Email } from "./email";
import { siteLink, siteUrl } from "./siteUrl";

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "VERCEL_ENV", "VERCEL_URL", "SITE_URL"] as const;
let savedEnv: Record<string, string | undefined>;
let logs: string[];
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalWarn: typeof console.warn;
let originalFetch: typeof fetch;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  logs = [];
  originalLog = console.log;
  originalError = console.error;
  originalWarn = console.warn;
  console.log = (...a: unknown[]) => void logs.push(a.join(" "));
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  console.warn = (...a: unknown[]) => void logs.push(a.join(" "));
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  globalThis.fetch = originalFetch;
});

const sample: Email = {
  to: "delivered@resend.dev",
  subject: "Reset your password",
  paragraphs: ["Hi Sam,", "Choose a new password with the button below."],
  button: { label: "Choose a new password", url: "https://getassistcoaching.com/reset-password/SECRET_TOKEN_abc123" },
  footnote: "This link works once and expires in 1 hour.",
};

test("siteUrl: SITE_URL in production, the preview's own URL on previews, localhost otherwise", () => {
  assert.equal(siteUrl(), "http://localhost:3000");
  process.env.SITE_URL = "https://getassistcoaching.com/";
  assert.equal(siteUrl(), "https://getassistcoaching.com");
  assert.equal(siteLink("dashboard"), "https://getassistcoaching.com/dashboard");
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "my-app-git-x.vercel.app";
  assert.equal(siteUrl(), "https://my-app-git-x.vercel.app");
  process.env.VERCEL_ENV = "production";
  assert.equal(siteUrl(), "https://getassistcoaching.com");
});

test("canDeliverTo: only @resend.dev test inboxes outside Vercel production", () => {
  assert.equal(canDeliverTo("delivered@resend.dev", undefined), true);
  assert.equal(canDeliverTo("bounced@resend.dev", "preview"), true);
  assert.equal(canDeliverTo("parent@gmail.com", undefined), false);
  assert.equal(canDeliverTo("parent@gmail.com", "preview"), false);
  assert.equal(canDeliverTo("someone@resend.dev.evil.com", undefined), false);
  assert.equal(canDeliverTo("parent@gmail.com", "production"), true);
});

test("safeText and firstName fall back when the contact filter would block the value", () => {
  assert.equal(safeText("Mitchell Park, Palo Alto", "x"), "Mitchell Park, Palo Alto");
  assert.equal(safeText("text me at 415-555-0123", "the place in your booking"), "the place in your booking");
  assert.equal(safeText("my insta is samhoops", "x"), "x");
  assert.equal(safeText("  ", "x"), "x");
  assert.equal(firstName("Priya Shah"), "Priya");
  assert.equal(firstName(null), "someone");
});

test("rendering escapes HTML, keeps a plain-text version and has no tracking", () => {
  const html = renderHtml({ ...sample, paragraphs: ['<script>alert("x")</script> & more'] });
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!/<img/i.test(html), "no images (no tracking pixel)");
  assert.ok(html.includes(sample.button!.url), "button links straight to the site, not a redirect");
  const text = renderText(sample);
  assert.ok(text.includes("Choose a new password: https://getassistcoaching.com/reset-password/SECRET_TOKEN_abc123"));
  assert.ok(text.includes("doesn't take replies"));
});

test("no key: logs instead of sending, and never logs the link or token", async () => {
  globalThis.fetch = (() => assert.fail("must not call Resend without a key")) as typeof fetch;
  const result = await sendEmail(sample);
  assert.equal(result.status, "logged");
  const all = logs.join("\n");
  assert.ok(all.includes("Reset your password"));
  assert.ok(!all.includes("SECRET_TOKEN"), "token must not be logged");
  assert.ok(!all.includes("https://getassistcoaching.com/reset-password"), "link must not be logged");
  assert.ok(all.includes("[link withheld from logs]"));
});

test("key set, outside production: real addresses are suppressed, not sent", async () => {
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.EMAIL_FROM = "Assist Coaching <noreply@send.getassistcoaching.com>";
  globalThis.fetch = (() => assert.fail("must not send to a real address outside production")) as typeof fetch;
  const result = await sendEmail({ ...sample, to: "parent@gmail.com" });
  assert.equal(result.status, "suppressed");
  assert.ok(!logs.join("\n").includes("SECRET_TOKEN"));
});

test("key set: posts to Resend with from, html and text; logs only the id", async () => {
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.EMAIL_FROM = "Assist Coaching <noreply@send.getassistcoaching.com>";
  let call: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    call = { url, init };
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  }) as typeof fetch;
  const result = await sendEmail(sample);
  assert.deepEqual(result, { status: "sent", id: "email_123" });
  assert.ok(call);
  const { url, init } = call as { url: string; init: RequestInit };
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer re_test_dummy");
  const body = JSON.parse(String(init.body));
  assert.deepEqual(body.to, ["delivered@resend.dev"]);
  assert.equal(body.from, "Assist Coaching <noreply@send.getassistcoaching.com>");
  assert.ok(body.html.includes("Assist") && body.text.includes("Choose a new password"));
  assert.deepEqual(Object.keys(body).sort(), ["from", "html", "subject", "text", "to"], "no tracking or extra options");
  const all = logs.join("\n");
  assert.ok(all.includes("email_123"));
  assert.ok(!all.includes("SECRET_TOKEN") && !all.includes("re_test_dummy"));
});

test("Resend error: logs status and error name only", async () => {
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.EMAIL_FROM = "Assist Coaching <noreply@send.getassistcoaching.com>";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ name: "validation_error", message: "bad link https://getassistcoaching.com/reset-password/SECRET_TOKEN_abc123" }), {
      status: 422,
    })) as typeof fetch;
  const result = await sendEmail(sample);
  assert.equal(result.status, "failed");
  const all = logs.join("\n");
  assert.ok(all.includes("422") && all.includes("validation_error"));
  assert.ok(!all.includes("SECRET_TOKEN"));
});

test("an email whose text trips the contact filter is still sent, with only that text replaced", async () => {
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.EMAIL_FROM = "Assist Coaching <noreply@send.getassistcoaching.com>";
  let body: { text: string } | null = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "email_9" }), { status: 200 });
  }) as typeof fetch;
  const result = await sendEmail({ ...sample, paragraphs: ["See you Saturday.", "Call me at 415-555-0123"] });
  assert.equal(result.status, "sent");
  assert.ok(body!.text.includes("See you Saturday."));
  assert.ok(body!.text.includes("[removed]") && !body!.text.includes("415-555-0123"));
  assert.ok(!logs.join("\n").includes("415-555-0123"), "the matched text itself isn't logged");
  assert.ok(logs.join("\n").includes("Replaced text"), "the replacement is logged");
});
