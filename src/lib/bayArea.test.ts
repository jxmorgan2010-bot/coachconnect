import { test } from "node:test";
import assert from "node:assert/strict";
import { locationLooksOutsideBayArea } from "./bayArea";

test("warns on clear signs of somewhere outside the Bay Area", () => {
  for (const place of [
    "austin",
    "Austin",
    "Zilker Park, Austin, TX",
    "Austin TX",
    "Austin Texas",
    "Pease Park 78701",
    "Rec center, CA 95814", // Sacramento ZIP
    "Dublin, OH",
    "Richmond, VA",
    "Central Park, New York",
    "Green Lake, Seattle",
    "Balboa Park, San Diego",
    "Lighthouse Field, Santa Cruz",
  ]) {
    assert.equal(locationLooksOutsideBayArea(place), true, place);
  }
});

test("stays quiet for Bay Area places", () => {
  for (const place of [
    "Mitchell Park, Palo Alto",
    "Mitchell Park, Palo Alto, CA 94303",
    "Golden Gate Park tennis courts, SF",
    "Dolores Park 94110",
    "Rec center gym, 94301",
    "Tilden Park, Berkeley CA",
    "Dublin Sports Grounds, Dublin",
    "Lakeshore Ave park, Oakland, California",
    "Rengstorff Park, Mountain View, CA 94040",
    "San Jose 95128", // in a Bay Area ZIP range even if missing from the curated list
  ]) {
    assert.equal(locationLooksOutsideBayArea(place), false, place);
  }
});

test("Bay Area streets named after other places don't trigger it", () => {
  for (const place of ["Sacramento St playground", "Austin St courts", "Santa Cruz Ave field", "Monterey Blvd rec center", "Stockton Street gym"]) {
    assert.equal(locationLooksOutsideBayArea(place), false, place);
  }
});

test("stays quiet on anything it can't place, and on partial typing", () => {
  for (const place of ["", "  ", "Lincoln Park field", "the rec center gym, court 2", "the gym, I'll go in", "Aus", "Mitchell Park, or the school"]) {
    assert.equal(locationLooksOutsideBayArea(place), false, JSON.stringify(place));
  }
});
