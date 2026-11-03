import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStripeFailure } from "./payment";

test("card problems need the parent; Stripe or network problems are retried", () => {
  assert.deepEqual(classifyStripeFailure({ type: "StripeCardError", code: "card_declined", decline_code: "generic_decline" }), {
    kind: "CARD",
    code: "generic_decline",
  });
  assert.deepEqual(classifyStripeFailure({ type: "StripeCardError", code: "authentication_required" }), {
    kind: "CARD",
    code: "authentication_required",
  });
  assert.equal(classifyStripeFailure({ type: "StripeInvalidRequestError", code: "resource_missing" }).kind, "CARD");
  for (const type of ["StripeConnectionError", "StripeAPIError", "StripeRateLimitError", "StripeAuthenticationError"]) {
    assert.equal(classifyStripeFailure({ type }).kind, "TEMPORARY", type);
  }
  // Not from Stripe: an admin should look rather than the job retrying forever.
  assert.deepEqual(classifyStripeFailure(new Error("Off-session hold pi_1 ended as requires_action.")), { kind: "CARD", code: "unexpected" });
});
