// Smoke tests for js/store.js — install localStorage shim BEFORE importing.
import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.localStorage = {
  _data: new Map(),
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
  setItem(k, v) { this._data.set(k, String(v)); },
  removeItem(k) { this._data.delete(k); },
  clear() { this._data.clear(); },
};

const store = await import("../js/store.js");
import { parseTermDays } from "../js/store.js";

function reset() {
  globalThis.localStorage.clear();
  // Wipe internal state by importing a snapshot of empty records.
  store.importSnapshot(JSON.stringify({ schema_version: 1, records: [], last_saved_at: "" }));
}

function baseRec(authCode, overrides = {}) {
  return {
    auth_code: authCode, part_number: "PN", description: "d",
    order_number: "", order_date: "", customer_po: "", end_user_po: "",
    serial: "", claimed_by: "", claimed_at: "", imported_at: "", notes: "",
    ...overrides,
  };
}

globalThis.__papitaTests = globalThis.__papitaTests || [];
const test = (name, fn) => globalThis.__papitaTests.push({ name, fn });

test("store: upsertMany dedup — newer claimed_at wins", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234", { claimed_at: "2025-01-01T00:00:00Z", notes: "old" })]);
  store.upsertMany([baseRec("ABCD1234", { claimed_at: "2025-02-01T00:00:00Z", notes: "new" })]);
  const rec = store.getByAuthCode("ABCD1234");
  assert.equal(rec.notes, "new");
});

test("store: unclaimed upsert preserves claim block but refreshes metadata", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234", {
    serial: "SN-OLD", claimed_at: "2025-02-01T00:00:00Z", claimed_by: "alice", notes: "old",
  })]);
  store.upsertMany([baseRec("ABCD1234", {
    serial: "", claimed_at: "", claimed_by: "", notes: "refreshed",
  })]);
  const rec = store.getByAuthCode("ABCD1234");
  // Claim block protected
  assert.equal(rec.serial, "SN-OLD");
  assert.equal(rec.claimed_at, "2025-02-01T00:00:00Z");
  assert.equal(rec.claimed_by, "alice");
  // Metadata refreshed
  assert.equal(rec.notes, "refreshed");
});

test("store: claim duplicate-serial conflict", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234"), baseRec("EFGH5678")]);
  const r1 = store.claim("ABCD1234", "X");
  assert.equal(r1.ok, true);
  const r2 = store.claim("EFGH5678", "X");
  assert.equal(r2.ok, false);
  assert.ok(r2.conflict);
  assert.equal(r2.conflict.serial, "X");
  assert.equal(r2.conflict.authCode, "ABCD1234");
});

test("store: claim override resolves duplicate-serial", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234"), baseRec("EFGH5678")]);
  store.claim("ABCD1234", "X");
  const r2 = store.claim("EFGH5678", "X", { override: true });
  assert.equal(r2.ok, true);
  assert.equal(store.getByAuthCode("EFGH5678").serial, "X");
});

test("store: unclaim clears serial, claimed_at, claimed_by", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234")]);
  store.claim("ABCD1234", "SN1", { claimedBy: "alice" });
  const u = store.unclaim("ABCD1234");
  assert.equal(u.ok, true);
  const rec = store.getByAuthCode("ABCD1234");
  assert.equal(rec.serial, "");
  assert.equal(rec.claimed_at, "");
  assert.equal(rec.claimed_by, "");
});

test("store: subscribe fires once per mutation", () => {
  reset();
  let count = 0;
  const unsub = store.subscribe(() => { count++; });
  store.upsertMany([baseRec("ABCD1234")]);
  store.claim("ABCD1234", "SN1");
  store.unclaim("ABCD1234");
  unsub();
  assert.equal(count, 3);
});

test("store: claim sets claimed_by and trims whitespace", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234"), baseRec("EFGH5678")]);
  store.claim("ABCD1234", "SN1", { claimedBy: "alice" });
  assert.equal(store.getByAuthCode("ABCD1234").claimed_by, "alice");
  store.claim("EFGH5678", "SN2", { claimedBy: "  bob  " });
  assert.equal(store.getByAuthCode("EFGH5678").claimed_by, "bob");
});

test("store: upsertMany returns counts shape", () => {
  reset();
  const result = store.upsertMany([baseRec("ABCD1234")]);
  assert.ok("added" in result && "skipped" in result && "updated" in result && "errors" in result);
  assert.equal(result.added, 1);
  assert.ok(Array.isArray(result.errors));
});

// PAP-2 — override behavior tests

test("store: claim override clears prior serial", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234"), baseRec("EFGH5678")]);
  store.claim("ABCD1234", "SN-OVERRIDE-TEST", { claimedBy: "Alice" });
  const r = store.claim("EFGH5678", "SN-OVERRIDE-TEST", { override: true, claimedBy: "Bob" });
  assert.equal(r.ok, true, "override claim should return ok: true");
  // Prior holder (A) must be cleared
  const recA = store.getByAuthCode("ABCD1234");
  assert.equal(recA.serial, "", "prior holder serial must be cleared");
  assert.equal(recA.claimed_at, "", "prior holder claimed_at must be cleared");
  assert.equal(recA.claimed_by, "", "prior holder claimed_by must be cleared");
  // New holder (B) must hold the serial
  const recB = store.getByAuthCode("EFGH5678");
  assert.equal(recB.serial, "SN-OVERRIDE-TEST", "new holder must carry the serial");
});

test("store: claim override sets notes on new record", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234"), baseRec("EFGH5678")]);
  store.claim("ABCD1234", "SN-OVERRIDE-TEST", { claimedBy: "Alice" });
  store.claim("EFGH5678", "SN-OVERRIDE-TEST", { override: true, claimedBy: "Bob" });
  const recB = store.getByAuthCode("EFGH5678");
  assert.ok(
    typeof recB.notes === "string" && recB.notes.includes("Reclaimed from"),
    `new holder notes should contain "Reclaimed from", got: "${recB.notes}"`
  );
});

test("store: claim override appends notes when notes already populated", () => {
  reset();
  store.upsertMany([
    baseRec("ABCD1234"),
    baseRec("EFGH5678", { notes: "existing note" }),
  ]);
  store.claim("ABCD1234", "SN-OVERRIDE-TEST2", { claimedBy: "Alice" });
  store.claim("EFGH5678", "SN-OVERRIDE-TEST2", { override: true, claimedBy: "Carol" });
  const recB = store.getByAuthCode("EFGH5678");
  assert.ok(
    typeof recB.notes === "string" && recB.notes.includes("existing note"),
    `notes should retain "existing note", got: "${recB.notes}"`
  );
  assert.ok(
    recB.notes.includes("Reclaimed from"),
    `notes should also contain "Reclaimed from", got: "${recB.notes}"`
  );
  assert.ok(
    recB.notes.includes("\n"),
    `notes should join with newline, got: "${recB.notes}"`
  );
});

test("store: claim override clears notes on prior record", () => {
  reset();
  store.upsertMany([
    baseRec("ABCD1234", { notes: "prior notes that should be cleared" }),
    baseRec("EFGH5678"),
  ]);
  store.claim("ABCD1234", "SN-NOTES-CLEAR-TEST", { claimedBy: "Alice" });
  store.claim("EFGH5678", "SN-NOTES-CLEAR-TEST", { override: true, claimedBy: "Bob" });
  const recA = store.getByAuthCode("ABCD1234");
  assert.equal(recA.notes, "", "prior holder notes must be cleared to empty string after override");
});

test("store: upsertMany does not restore overridden claim via re-import", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234"), baseRec("EFGH5678")]);
  // A claims serial X
  store.claim("ABCD1234", "SN-REIMPORT-TEST", { claimedBy: "Alice" });
  // Capture A's old claim row as it would appear in a pre-override CSV export
  const oldA = { ...store.getByAuthCode("ABCD1234") };
  // B overrides: A is cleared, B holds the serial
  store.claim("EFGH5678", "SN-REIMPORT-TEST", { override: true, claimedBy: "Bob" });
  // Re-import old CSV row for A — must not restore the claim
  store.upsertMany([oldA]);
  const recA = store.getByAuthCode("ABCD1234");
  assert.equal(recA.serial, "", "re-import must not restore overridden serial on prior holder");
  const recB = store.getByAuthCode("EFGH5678");
  assert.equal(recB.serial, "SN-REIMPORT-TEST", "new holder must retain serial after re-import");
});

test("store: claim conflict returns full details", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234"), baseRec("EFGH5678")]);
  store.claim("ABCD1234", "SN-CONFLICT-DETAIL", { claimedBy: "Dave" });
  const result = store.claim("EFGH5678", "SN-CONFLICT-DETAIL");
  assert.equal(result.ok, false, "conflict should return ok: false");
  assert.ok(result.conflict, "result.conflict must be present");
  assert.equal(result.conflict.claimedBy, "Dave", "conflict.claimedBy must match original claimer");
  assert.ok(
    typeof result.conflict.claimedAt === "string" && result.conflict.claimedAt.length > 0,
    "conflict.claimedAt must be a non-empty string"
  );
  assert.ok("partNumber" in result.conflict, "conflict.partNumber field must exist");
  assert.ok("description" in result.conflict, "conflict.description field must exist");
});

// PAP-5 — Term Days and Purchase Date tests (TDD — these MUST fail initially)

test("PAP-5: parseTermDays export parses year/month terms", () => {
  assert.equal(parseTermDays("1 year (12 months) term"), 365, "1 year = 365 days");
  assert.equal(parseTermDays("3 year term"), 1095, "3 years = 1095 days");
  assert.equal(parseTermDays("12 months term"), 360, "12 months = 360 days");
  assert.equal(parseTermDays("no match"), null, "unparseable returns null");
});

test("PAP-5: render.js contains purchased_at and term_days columns", () => {
  // This test will fail because render.js doesn't have these columns yet
  const renderJs = fs.readFileSync(new URL("../js/render.js", import.meta.url), "utf-8");
  assert.ok(renderJs.includes("purchased_at"), "render.js must contain 'purchased_at' column");
  assert.ok(renderJs.includes("term_days"), "render.js must contain 'term_days' column");
});

test("PAP-5: parseTermDays handles blank/undefined safely", () => {
  assert.equal(parseTermDays(""), null, "empty string returns null");
  assert.equal(parseTermDays(undefined), null, "undefined returns null");
});
