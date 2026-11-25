import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { handleStripeWebhook, type WebhookDeps } from "./stripeWebhook";
import type { DeliveryResult, PackageIntent } from "./packageIntent";

// handleStripeWebhook never touches the database or Stripe itself; both are faked here.
const SECRET = "whsec_unit_test";
const PACKAGE = { kind: "SESSION_PACKAGE", parentProfileId: "p1", coachProfileId: "c1", sport: "SOCCER", durationMinutes: "60" };

function payload(over: { type?: string; metadata?: Record<string, string> } = {}) {
  return JSON.stringify({
    id: "evt_1",
    object: "event",
    type: over.type ?? "payment_intent.succeeded",
    data: { object: { id: "pi_1", object: "payment_intent", metadata: over.metadata ?? PACKAGE } },
  });
}
const sign = (body: string, over: { secret?: string; timestamp?: number } = {}) =>
  Stripe.webhooks.generateTestHeaderString({ payload: body, secret: over.secret ?? SECRET, timestamp: over.timestamp });

function deps(result: DeliveryResult | Error = { status: "CREATED", packageId: "pkg1" }, over: Partial<WebhookDeps> = {}) {
  const calls = { retrieved: [] as string[], delivered: 0, emailed: [] as string[] };
  const d: WebhookDeps = {
    secret: SECRET,
    retrieveIntent: async (id) => {
      calls.retrieved.push(id);
      return { id } as PackageIntent;
    },
    deliver: async () => {
      calls.delivered++;
      if (result instanceof Error) throw result;
      return result;
    },
    onDelivered: (id) => calls.emailed.push(id),
    ...over,
  };
  return { d, calls };
}

test("a signed package payment is looked up in Stripe, delivered, and the parent is emailed", async () => {
  const { d, calls } = deps();
  const body = payload();
  assert.equal((await handleStripeWebhook(body, sign(body), d)).httpStatus, 200);
  assert.deepEqual(calls, { retrieved: ["pi_1"], delivered: 1, emailed: ["pkg1"] });
});

test("a repeat of an event answers 200 and doesn't email again", async () => {
  const { d, calls } = deps({ status: "EXISTING", packageId: "pkg1" });
  const body = payload();
  assert.equal((await handleStripeWebhook(body, sign(body), d)).httpStatus, 200);
  assert.deepEqual(calls.emailed, []);
});

test("no secret set: refused with an error Stripe will retry", async () => {
  for (const secret of [undefined, "", "  "]) {
    const { d, calls } = deps(undefined, { secret });
    const body = payload();
    assert.equal((await handleStripeWebhook(body, sign(body), d)).httpStatus, 503);
    assert.equal(calls.delivered, 0);
  }
});

test("missing, forged, altered or old signatures are refused", async () => {
  const body = payload();
  const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
  const cases: [string, string | null, string][] = [
    ["missing", null, body],
    ["garbage", "t=1,v1=abc", body],
    ["another secret", sign(body, { secret: "whsec_someone_else" }), body],
    ["altered body", sign(body), body.replace("pi_1", "pi_2")],
    ["10 minutes old", sign(body, { timestamp: tenMinutesAgo }), body],
  ];
  for (const [name, header, sent] of cases) {
    const { d, calls } = deps();
    assert.equal((await handleStripeWebhook(sent, header, d)).httpStatus, 400, name);
    assert.deepEqual(calls, { retrieved: [], delivered: 0, emailed: [] }, name);
  }
});

test("other events, and payments that aren't packages, are acknowledged and ignored", async () => {
  for (const body of [payload({ type: "payment_intent.payment_failed" }), payload({ type: "charge.refunded" }), payload({ metadata: {} }), payload({ metadata: { parentProfileId: "p1", coachProfileId: "c1" } })]) {
    const { d, calls } = deps();
    assert.equal((await handleStripeWebhook(body, sign(body), d)).httpStatus, 200);
    assert.deepEqual(calls.retrieved, []);
  }
});

test("a package payment from before `kind` was recorded still counts", async () => {
  const legacy = { parentProfileId: "p1", coachProfileId: "c1", sport: "SOCCER", durationMinutes: "60" };
  const { d, calls } = deps();
  const body = payload({ metadata: legacy });
  await handleStripeWebhook(body, sign(body), d);
  assert.equal(calls.delivered, 1);
});

test("refunded or unpaid: acknowledged, nothing to do", async () => {
  for (const status of ["REFUNDED", "NOT_PAID"] as const) {
    const { d, calls } = deps({ status });
    const body = payload();
    assert.equal((await handleStripeWebhook(body, sign(body), d)).httpStatus, 200);
    assert.deepEqual(calls.emailed, []);
  }
});

test("a delivery that fails, or can't be made, answers an error so Stripe retries and shows it", async () => {
  for (const result of [new Error("database is down"), { status: "UNDELIVERABLE", reason: "the coach's account is gone" } as const]) {
    const { d, calls } = deps(result);
    const body = payload();
    const answer = await handleStripeWebhook(body, sign(body), d);
    assert.equal(answer.httpStatus, 500);
    assert.ok(!JSON.stringify(answer.body).includes("database is down"));
    assert.deepEqual(calls.emailed, []);
  }
});
