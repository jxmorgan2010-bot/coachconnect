/**
 * Database tests for the teen interest list. They delete every TeenInterestEntry row first, so
 * they refuse to run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db TEEN_INTEREST_DB_TEST=1 \
 *   npx tsx --test src/lib/teenInterestStore.db-test.ts
 *
 * The scratch copy needs prisma/sql/2026-11-12-teen-interest-list.sql applied first.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.DATABASE_URL ?? "";
if (process.env.TEEN_INTEREST_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set TEEN_INTEREST_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}

import { prisma } from "./prisma";
import { parseCalendarDate } from "./age";
import { hashRemoveToken, joinTeenInterestList, findByRemoveToken, removeByToken, setContacted } from "./teenInterestStore";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-12T20:00:00Z");
const input = {
  firstName: "Maya",
  email: "  Maya@Example.com ",
  sports: ["SOCCER" as const, "TENNIS" as const],
  school: "Lowell",
  gradYear: 2027,
  parentEmail: "Parent@Example.com",
  turns18On: parseCalendarDate("2027-03-04")!,
};

beforeEach(async () => {
  await prisma.teenInterestEntry.deleteMany({});
});

test("a new entry stores only the listed fields, lowercased email, hashed token", async () => {
  const { removeToken } = await joinTeenInterestList(input, NOW);
  assert.ok(removeToken);
  const rows = await prisma.teenInterestEntry.findMany();
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.email, "maya@example.com");
  assert.equal(r.parentEmail, "parent@example.com");
  assert.equal(r.sports, "SOCCER,TENNIS");
  assert.equal(r.turns18On.toISOString(), "2027-03-04T00:00:00.000Z");
  assert.equal(r.removeTokenHash, hashRemoveToken(removeToken!));
  assert.notEqual(r.removeTokenHash, removeToken);
  assert.equal(r.confirmationSentAt?.toISOString(), NOW.toISOString());
  assert.equal(r.contactedAt, null);
});

test("signing up again within 24 hours updates the entry, sends nothing, keeps the old link", async () => {
  const first = await joinTeenInterestList(input, NOW);
  const again = await joinTeenInterestList({ ...input, school: "Galileo", parentEmail: undefined }, new Date(NOW.getTime() + 23 * HOUR));
  assert.equal(again.removeToken, null);
  const rows = await prisma.teenInterestEntry.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].school, "Galileo");
  assert.equal(rows[0].parentEmail, null);
  assert.deepEqual(await findByRemoveToken(first.removeToken!), { email: "maya@example.com" });
});

test("after 24 hours a repeat signup gets a new link and the old one stops working", async () => {
  const first = await joinTeenInterestList(input, NOW);
  const later = await joinTeenInterestList(input, new Date(NOW.getTime() + 25 * HOUR));
  assert.ok(later.removeToken);
  assert.equal(await findByRemoveToken(first.removeToken!), null);
  assert.deepEqual(await findByRemoveToken(later.removeToken!), { email: "maya@example.com" });
  assert.equal(await prisma.teenInterestEntry.count(), 1);
});

test("removal deletes the entry once; bad or reused tokens do nothing", async () => {
  const { removeToken } = await joinTeenInterestList(input, NOW);
  await joinTeenInterestList({ ...input, email: "other@example.com" }, NOW);
  assert.equal(await removeByToken("not-a-token"), false);
  assert.equal(await removeByToken("A".repeat(43)), false);
  assert.equal(await removeByToken(removeToken!), true);
  assert.equal(await removeByToken(removeToken!), false);
  const left = await prisma.teenInterestEntry.findMany();
  assert.deepEqual(left.map((r) => r.email), ["other@example.com"]);
});

test("contacted: ticking keeps the first date, unticking clears it, a removed entry reports false", async () => {
  await joinTeenInterestList(input, NOW);
  const { id } = (await prisma.teenInterestEntry.findFirst())!;
  assert.equal(await setContacted(id, true, NOW), true);
  assert.equal(await setContacted(id, true, new Date(NOW.getTime() + HOUR)), true);
  assert.equal((await prisma.teenInterestEntry.findUnique({ where: { id } }))!.contactedAt?.toISOString(), NOW.toISOString());
  assert.equal(await setContacted(id, false), true);
  assert.equal((await prisma.teenInterestEntry.findUnique({ where: { id } }))!.contactedAt, null);
  assert.equal(await setContacted("missing", true), false);
});
