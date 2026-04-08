// Smoke tests for js/store.js — install localStorage shim BEFORE importing.
import assert from "node:assert/strict";

globalThis.localStorage = {
  _data: new Map(),
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
  setItem(k, v) { this._data.set(k, String(v)); },
  removeItem(k) { this._data.delete(k); },
  clear() { this._data.clear(); },
};

const store = await import("../../../../js/store.js");

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

test("store: unclaimed never overwrites claimed", () => {
  reset();
  store.upsertMany([baseRec("ABCD1234", { claimed_at: "2025-02-01T00:00:00Z", notes: "claimed" })]);
  store.upsertMany([baseRec("ABCD1234", { claimed_at: "", notes: "unclaimed" })]);
  const rec = store.getByAuthCode("ABCD1234");
  assert.equal(rec.notes, "claimed");
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
