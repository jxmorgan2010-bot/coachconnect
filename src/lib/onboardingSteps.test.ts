import { test } from "node:test";
import assert from "node:assert/strict";
import { areCoachOwnStepsDone, isIdStepDone, type CoachOwnStepsInput } from "./onboardingSteps";

const DONE: CoachOwnStepsInput = {
  profileComplete: true,
  hasAvailability: true,
  hasIdPhoto: true,
  idStatus: "PENDING",
  hasProfilePhoto: true,
  conductAcknowledged: true,
  guardianConsentDone: null,
};

test("an uploaded ID waiting for review completes the coach's ID step", () => {
  assert.equal(isIdStepDone(DONE), true);
  assert.equal(isIdStepDone({ ...DONE, idStatus: "APPROVED" }), true);
});

test("the ID step needs both the ID and the photo, and not a rejected ID", () => {
  assert.equal(isIdStepDone({ ...DONE, hasIdPhoto: false }), false);
  assert.equal(isIdStepDone({ ...DONE, hasProfilePhoto: false }), false);
  assert.equal(isIdStepDone({ ...DONE, idStatus: "REJECTED" }), false);
});

test("own steps are done without any admin step (ID approval, background check)", () => {
  assert.equal(areCoachOwnStepsDone(DONE), true);
});

test("each own step is required", () => {
  for (const key of ["profileComplete", "hasAvailability", "hasIdPhoto", "hasProfilePhoto", "conductAcknowledged"] as const) {
    assert.equal(areCoachOwnStepsDone({ ...DONE, [key]: false }), false, key);
  }
});

test("minor coaches also need parent/guardian consent", () => {
  assert.equal(areCoachOwnStepsDone({ ...DONE, guardianConsentDone: false }), false);
  assert.equal(areCoachOwnStepsDone({ ...DONE, guardianConsentDone: true }), true);
});
