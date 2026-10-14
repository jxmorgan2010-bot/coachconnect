import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UPLOAD_RULES,
  checkUploadFile,
  coachUploadPathname,
  coachUploadPrefix,
  isOwnUploadPathname,
  isUploadKind,
  isBioVideoClipType,
} from "./uploadRules";

const MB = 1024 * 1024;
const COACH = "cmcoach123";

test("school IDs are the only private uploads", () => {
  assert.equal(UPLOAD_RULES.id.access, "private");
  assert.equal(UPLOAD_RULES.photo.access, "public");
  assert.equal(UPLOAD_RULES.video.access, "public");
});

test("size and type limits match the previous local-disk limits", () => {
  for (const kind of ["id", "photo"] as const) {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      assert.equal(checkUploadFile(kind, { type, size: 8 * MB }), null);
    }
    assert.equal(checkUploadFile(kind, { type: "image/png", size: 8 * MB + 1 }), "File is too large (8MB max).");
    assert.equal(checkUploadFile(kind, { type: "image/gif", size: 1000 }), "Only JPEG, PNG, or WEBP images are allowed.");
    assert.equal(checkUploadFile(kind, { type: "video/mp4", size: 1000 }), "Only JPEG, PNG, or WEBP images are allowed.");
  }
  for (const type of ["video/mp4", "video/webm", "video/quicktime"]) {
    assert.equal(checkUploadFile("video", { type, size: 50 * MB }), null);
  }
  assert.match(checkUploadFile("video", { type: "video/mp4", size: 50 * MB + 1 }) ?? "", /too large \(50MB max/);
  assert.equal(checkUploadFile("video", { type: "image/png", size: 1000 }), "Only MP4, WEBM, or MOV videos are allowed.");
});

test("object property names aren't mistaken for allowed types", () => {
  for (const type of ["constructor", "toString", "__proto__", ""]) {
    assert.notEqual(checkUploadFile("photo", { type, size: 10 }), null);
  }
});

test("pathnames sit in the coach's own folder with the right extension", () => {
  assert.equal(coachUploadPathname("id", COACH, "image/jpeg"), "id-verifications/cmcoach123/school-id.jpg");
  assert.equal(coachUploadPathname("photo", COACH, "image/webp"), "coach-photos/cmcoach123/photo.webp");
  assert.equal(coachUploadPathname("video", COACH, "video/quicktime", "coaching"), "coach-videos/cmcoach123/coaching.mov");
  assert.equal(coachUploadPrefix("id", COACH), "id-verifications/cmcoach123/");
});

test("a coach can only confirm files in their own folder for that kind", () => {
  const own = "id-verifications/cmcoach123/school-id-AbC123.jpg";
  assert.equal(isOwnUploadPathname("id", COACH, own), true);
  assert.equal(isOwnUploadPathname("id", "cmother", own), false);
  assert.equal(isOwnUploadPathname("photo", COACH, own), false);
  assert.equal(isOwnUploadPathname("id", COACH, "id-verifications/cmcoach123/"), false);
  assert.equal(isOwnUploadPathname("id", COACH, "id-verifications/cmcoach123/../cmother/x.jpg"), false);
  assert.equal(isOwnUploadPathname("id", COACH, "id-verifications/cmcoach123/nested/x.jpg"), false);
  assert.equal(isOwnUploadPathname("id", COACH, "id-verifications/cmcoach123/..\\x.jpg"), false);
  assert.equal(isOwnUploadPathname("id", COACH, "id-verifications/cmcoach1234/x.jpg"), false);
});

test("kind and clip type guards", () => {
  assert.equal(isUploadKind("id"), true);
  assert.equal(isUploadKind("ID"), false);
  assert.equal(isUploadKind(undefined), false);
  assert.equal(isBioVideoClipType("playing"), true);
  assert.equal(isBioVideoClipType("outro"), false);
});
