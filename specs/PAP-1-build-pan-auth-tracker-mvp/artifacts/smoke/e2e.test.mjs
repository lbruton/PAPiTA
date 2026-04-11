// PAP-4 — End-to-end import/claim/CSV-roundtrip smoke scenario.
//
// Walks the full multi-PDF + CSV-roundtrip lifecycle using the three sanitized
// sample PDFs in CoWork/samples/. The 10 sequential steps ARE the contract:
// PDF in -> partial claim -> CSV out -> CSV in (merge) -> another PDF in ->
// CSV out -> third PDF in -> claim all -> re-import old CSV (merge across
// three orders). Asserts auth_code-as-merge-key invariant on every CSV import.
//
// Sample PDFs are gitignored. If CoWork/samples/ is missing, the test
// registers a single skipped placeholder rather than failing — keeps CI green.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// localStorage shim — must be installed BEFORE importing store.js.
globalThis.localStorage = {
  _data: new Map(),
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
  setItem(k, v) { this._data.set(k, String(v)); },
  removeItem(k) { this._data.delete(k); },
  clear() { this._data.clear(); },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const samplesDir = path.join(repoRoot, "CoWork/samples");

globalThis.__papitaTests = globalThis.__papitaTests || [];
const test = (name, fn) => globalThis.__papitaTests.push({ name, fn });

const SAMPLE_FILES = {
  acme: "AuthCode_Sample_ACME_10717301.pdf",
  global: "AuthCode_Sample_GlobalLogistics_10718844.pdf",
  northstar: "AuthCode_Sample_NorthStar_10719902.pdf",
};

const missingSamples = Object.values(SAMPLE_FILES).filter(
  (f) => !fs.existsSync(path.join(samplesDir, f))
);
if (missingSamples.length > 0) {
  test(`e2e: SKIPPED (missing CoWork/samples/: ${missingSamples.join(", ")} — run CoWork/gen_samples.py)`, () => {});
} else {
  // Lazy import store/csv/parser — only loaded when samples are present.
  const store = await import("../../../../js/store.js");
  const csv = await import("../../../../js/csv.js");
  const parser = await import("../../../../js/parser.js");

  function reset() {
    globalThis.localStorage.clear();
    store.importSnapshot(JSON.stringify({ schema_version: 1, records: [], last_saved_at: "" }));
  }

  // Wrap a Buffer as a File-like object (parser only calls .arrayBuffer()).
  function fileShim(filename) {
    const buf = fs.readFileSync(path.join(samplesDir, filename));
    // Slice to a fresh ArrayBuffer to avoid SharedArrayBuffer / pooled-Buffer issues.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { arrayBuffer: () => Promise.resolve(ab) };
  }

  async function importPdf(filename) {
    const result = await parser.parseFile(fileShim(filename));
    if (result.error) throw new Error(`parser error on ${filename}: ${result.error}`);
    store.upsertMany(result.records);
    return result.records;
  }

  function uniqueAuthCodes() {
    return new Set(store.getAll().map((r) => r.auth_code));
  }

  test("e2e: full multi-PDF + CSV roundtrip lifecycle (PAP-4)", async () => {
    reset();

    // --- Step 1: empty store
    assert.equal(store.getAll().length, 0, "step 1: store should start empty");

    // --- Step 2: import ACME PDF -> 8 records, all order 10717301
    const acmeRecs = await importPdf(SAMPLE_FILES.acme);
    assert.equal(acmeRecs.length, 8, "step 2: ACME PDF should yield 8 records");
    assert.equal(store.getAll().length, 8);
    for (const r of store.getAll()) {
      assert.equal(r.order_number, "10717301", "step 2: every ACME record carries order 10717301");
    }
    assert.equal(uniqueAuthCodes().size, 8, "step 2: all 8 auth codes unique");

    // --- Step 3: claim 7 of 8 with unique serials
    const acmeAuthCodes = store.getAll().map((r) => r.auth_code);
    const unclaimedCode = acmeAuthCodes[7];
    for (let i = 0; i < 7; i++) {
      const res = store.claim(acmeAuthCodes[i], `SN-ACME-${1000 + i}`, { claimedBy: "test-runner" });
      assert.ok(res.ok, `step 3: claim ${i} should succeed`);
    }
    const claimedCount = store.getAll().filter((r) => r.serial).length;
    assert.equal(claimedCount, 7, "step 3: exactly 7 records should be claimed");

    // --- Step 4: export CSV, assert all 8 + 7 serials populated
    const csv1 = csv.encode(store.getAll());
    const decoded1 = csv.decode(csv1);
    assert.equal(decoded1.errors.length, 0, "step 4: CSV roundtrip should produce no errors");
    assert.equal(decoded1.records.length, 8, "step 4: exported CSV should contain 8 records");
    assert.equal(
      decoded1.records.filter((r) => r.serial).length,
      7,
      "step 4: 7 of 8 CSV records should have serials"
    );

    // --- Step 5: edit CSV to add serial for 8th record, re-import, assert merge
    const editedRecs = decoded1.records.map((r) =>
      r.auth_code === unclaimedCode
        ? { ...r, serial: "SN-ACME-1099", claimed_by: "test-runner", claimed_at: "2026-04-08T12:00:00Z" }
        : r
    );
    const editedCsv = csv.encode(editedRecs);
    const reparsed = csv.decode(editedCsv);
    assert.equal(reparsed.errors.length, 0, "step 5: edited CSV should reparse cleanly");
    store.upsertMany(reparsed.records);
    assert.equal(store.getAll().length, 8, "step 5: still 8 records after CSV merge (no dupes)");
    assert.equal(uniqueAuthCodes().size, 8, "step 5: still 8 unique auth codes");
    const lastClaimed = store.getByAuthCode(unclaimedCode);
    assert.equal(lastClaimed.serial, "SN-ACME-1099", "step 5: 8th record now claimed via CSV");
    assert.equal(
      store.getAll().filter((r) => r.serial).length,
      8,
      "step 5: all 8 records now have serials"
    );

    // --- Step 6: import GlobalLogistics PDF -> 14 total, 2 orders
    const glRecs = await importPdf(SAMPLE_FILES.global);
    assert.equal(glRecs.length, 6, "step 6: GlobalLogistics PDF should yield 6 records");
    assert.equal(store.getAll().length, 14, "step 6: total now 14 (8 ACME + 6 GL)");
    const orders = new Set(store.getAll().map((r) => r.order_number));
    assert.equal(orders.size, 2, "step 6: exactly 2 distinct order numbers");
    assert.ok(orders.has("10717301") && orders.has("10718844"), "step 6: both order numbers present");

    // --- Step 7: export CSV containing both orders
    const csv2 = csv.encode(store.getAll());
    const decoded2 = csv.decode(csv2);
    assert.equal(decoded2.records.length, 14, "step 7: CSV contains all 14 records");
    assert.equal(decoded2.errors.length, 0, "step 7: CSV roundtrip should produce no errors");
    // ACME serials should still be in the exported CSV
    const acmeWithSerials = decoded2.records.filter(
      (r) => r.order_number === "10717301" && r.serial
    );
    assert.equal(acmeWithSerials.length, 8, "step 7: all 8 ACME serials preserved in export");

    // --- Step 8: import NorthStar PDF -> 26 total, 3 orders
    const nsRecs = await importPdf(SAMPLE_FILES.northstar);
    assert.equal(nsRecs.length, 12, "step 8: NorthStar PDF should yield 12 records");
    assert.equal(store.getAll().length, 26, "step 8: total now 26 (8 + 6 + 12)");
    const orders3 = new Set(store.getAll().map((r) => r.order_number));
    assert.equal(orders3.size, 3, "step 8: exactly 3 distinct order numbers");

    // --- Step 9: claim all 12 NorthStar devices
    const nsAuthCodes = store
      .getAll()
      .filter((r) => r.order_number === "10719902")
      .map((r) => r.auth_code);
    assert.equal(nsAuthCodes.length, 12, "step 9: should find 12 NorthStar auth codes to claim");
    for (let i = 0; i < nsAuthCodes.length; i++) {
      const res = store.claim(nsAuthCodes[i], `SN-NS-${2000 + i}`, { claimedBy: "test-runner" });
      assert.ok(res.ok, `step 9: NorthStar claim ${i} should succeed`);
    }
    const nsClaimed = store
      .getAll()
      .filter((r) => r.order_number === "10719902" && r.serial).length;
    assert.equal(nsClaimed, 12, "step 9: all 12 NorthStar records claimed");

    // --- Step 10: re-import the step-7 CSV (ACME + GL only, no NS).
    // Asserts: NS claims preserved, ACME/GL serials merged, no duplicates.
    store.upsertMany(decoded2.records);
    assert.equal(store.getAll().length, 26, "step 10: still 26 records (no dupes from CSV merge)");
    assert.equal(uniqueAuthCodes().size, 26, "step 10: 26 unique auth codes");

    // NS claims must survive — CSV had no NS rows, so upsert shouldn't touch them.
    const nsStillClaimed = store
      .getAll()
      .filter((r) => r.order_number === "10719902" && r.serial).length;
    assert.equal(nsStillClaimed, 12, "step 10: NorthStar claims preserved through CSV merge");

    // ACME + GL must still have their serials
    const acmeStillClaimed = store
      .getAll()
      .filter((r) => r.order_number === "10717301" && r.serial).length;
    assert.equal(acmeStillClaimed, 8, "step 10: ACME serials preserved");

    // Order count still 3
    const ordersFinal = new Set(store.getAll().map((r) => r.order_number));
    assert.equal(ordersFinal.size, 3, "step 10: still 3 distinct orders");

    // --- Step 11: override a NorthStar claim with an ACME serial (PAP-2)
    // Pick the first NorthStar auth code (claimed in step 9 with SN-NS-2000)
    const nsOverrideCode = nsAuthCodes[0];
    // Pick the first ACME auth code — claimed in step 3 with SN-ACME-1000
    const acmeOverrideCode = acmeAuthCodes[0];
    const acmeOverrideSerial = "SN-ACME-1000";

    // Override: take the ACME serial and reassign it to the NorthStar auth code
    const overrideResult = store.claim(nsOverrideCode, acmeOverrideSerial, {
      override: true,
      claimedBy: "Override Operator",
    });
    assert.ok(overrideResult.ok, "step 11: override claim should succeed");

    // ACME record must now be unclaimed
    const acmeAfterOverride = store.getByAuthCode(acmeOverrideCode);
    assert.equal(acmeAfterOverride.serial, "", "step 11: ACME record serial must be cleared after override");

    // NorthStar record must now hold the ACME serial
    const nsAfterOverride = store.getByAuthCode(nsOverrideCode);
    assert.equal(nsAfterOverride.serial, acmeOverrideSerial, "step 11: NorthStar record must hold the overridden serial");

    // NorthStar notes must contain "Reclaimed from"
    assert.ok(
      typeof nsAfterOverride.notes === "string" && nsAfterOverride.notes.includes("Reclaimed from"),
      `step 11: NorthStar notes must contain "Reclaimed from", got: "${nsAfterOverride.notes}"`
    );

    // Re-import the step-7 CSV (ACME + GL, which had SN-ACME-1000 on the ACME record).
    // upsertMany uses auth_code as merge key. The ACME record in CSV has:
    //   serial: "SN-ACME-1000", claimed_at: (timestamp from step 3)
    // The store ACME record now has: serial: "", claimed_at: ""
    // incomingWinsClaim logic: incomingClaimed is the step-3 timestamp (non-empty),
    // existingClaimed is "" — so incomingWinsClaim = true, and the CSV claim WINS.
    // Therefore after re-import, ACME will be re-claimed from the CSV.
    store.upsertMany(decoded2.records);
    // Verify re-import does not create duplicates
    assert.equal(store.getAll().length, 26, "step 11: still 26 records after re-import");
    // The ACME record will be re-claimed by the CSV (claimed_at timestamp wins)
    // This is the correct behavior — the CSV carried a valid claim timestamp
    const acmeAfterReimport = store.getByAuthCode(acmeOverrideCode);
    assert.equal(
      acmeAfterReimport.serial,
      acmeOverrideSerial,
      "step 11: ACME re-claimed from CSV re-import (CSV claimed_at wins merge)"
    );
  });
}
