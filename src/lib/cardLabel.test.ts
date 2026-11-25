import { test } from "node:test";
import assert from "node:assert/strict";
import { cardLabel } from "./cardLabel";

test("names the brand and last 4 digits", () => {
  assert.equal(cardLabel("visa", "4242"), "Visa ending 4242");
  assert.equal(cardLabel("mastercard", "4444"), "Mastercard ending 4444");
  assert.equal(cardLabel("amex", "8431"), "American Express ending 8431");
});

test("an unknown or missing brand still shows the digits", () => {
  assert.equal(cardLabel("unknown", "1234"), "Card ending 1234");
  assert.equal(cardLabel(null, "1234"), "Card ending 1234");
});

test("no digits", () => {
  assert.equal(cardLabel("visa", null), "Saved Visa card");
  assert.equal(cardLabel(null, undefined), "Saved card");
});
