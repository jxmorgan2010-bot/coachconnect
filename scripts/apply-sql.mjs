#!/usr/bin/env node
/**
 * Applies prisma/sql/*.sql files a database is missing, in date (file name) order.
 *
 *   node scripts/apply-sql.mjs ./scratch.db            dry run against a local SQLite file
 *   node scripts/apply-sql.mjs ./scratch.db --apply    apply to that file
 *   node scripts/apply-sql.mjs --turso [--apply]       Turso, from TURSO_DATABASE_URL and
 *                                                      TURSO_AUTH_TOKEN in your shell
 *
 * Dry run by default: it only reports what it would apply. Each statement is checked against
 * the database (column, table or index already there?): a file that's fully present is skipped,
 * a fully missing one is applied in one transaction, and a partly applied one stops the run.
 * Only ADD COLUMN, CREATE TABLE and CREATE INDEX are accepted. Prints every table's row count
 * before and after, and the integrity check. Never reads .env.
 */
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SQL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "sql");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const turso = args.includes("--turso");
const filePath = args.find((a) => !a.startsWith("--"));

let client;
if (turso) {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url || !process.env.TURSO_AUTH_TOKEN) {
    console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your shell first.");
    process.exit(1);
  }
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  console.log(`Target: Turso (${new URL(url).host})`);
} else if (filePath) {
  client = createClient({ url: `file:${filePath}` });
  console.log(`Target: ${filePath}`);
} else {
  console.error("Usage: node scripts/apply-sql.mjs <db file> [--apply]  |  --turso [--apply]");
  process.exit(1);
}
console.log(apply ? "Mode: APPLY\n" : "Mode: dry run (add --apply to make changes)\n");

function statements(file) {
  return readFileSync(join(SQL_DIR, file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function exists(stmt) {
  let m;
  if ((m = stmt.match(/^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/))) {
    const r = await client.execute(`PRAGMA table_info("${m[1]}")`);
    return r.rows.some((row) => row.name === m[2]);
  }
  if ((m = stmt.match(/^CREATE (?:UNIQUE )?INDEX "(\w+)"/)) || (m = stmt.match(/^CREATE TABLE "(\w+)"/))) {
    const r = await client.execute({ sql: "SELECT 1 FROM sqlite_master WHERE name = ?", args: [m[1]] });
    return r.rows.length > 0;
  }
  throw new Error(`Not an ADD COLUMN, CREATE TABLE or CREATE INDEX statement: ${stmt.slice(0, 80)}`);
}

async function rowCounts() {
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name",
  );
  const counts = {};
  for (const { name } of tables.rows) {
    counts[name] = Number((await client.execute(`SELECT COUNT(*) AS n FROM "${name}"`)).rows[0].n);
  }
  return counts;
}

const files = readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort();
// Check every statement before changing anything.
for (const file of files) for (const stmt of statements(file)) await exists(stmt);

const before = await rowCounts();
let pending = 0;
for (const file of files) {
  const stmts = statements(file);
  const present = [];
  for (const stmt of stmts) present.push(await exists(stmt));
  const done = present.filter(Boolean).length;
  if (done === stmts.length) {
    console.log(`already applied  ${file}`);
    continue;
  }
  if (done > 0) {
    console.error(`PARTLY APPLIED   ${file} (${done}/${stmts.length} statements present). Stopping; fix by hand.`);
    process.exit(1);
  }
  pending++;
  if (apply) {
    await client.batch(stmts, "write");
    console.log(`APPLIED          ${file} (${stmts.length} statements)`);
  } else {
    console.log(`would apply      ${file} (${stmts.length} statements)`);
  }
}

const after = await rowCounts();
console.log("\nRow counts (before -> after):");
for (const name of Object.keys(after)) console.log(`  ${name}: ${before[name] ?? "(new)"} -> ${after[name]}`);
const integrity = await client.execute("PRAGMA integrity_check");
console.log(`\nintegrity_check: ${Object.values(integrity.rows[0])[0]}`);
if (!apply && pending) console.log(`\n${pending} file(s) to apply. Run again with --apply.`);
