// Smoke tests for js/csv.js — round-trip, escaping, injection guard, atomic rejection.
import assert from "node:assert/strict";
import { encode, decode } from "../../../../js/csv.js";

const COLUMNS = [
  "auth_code", "part_number", "description", "order_number", "order_date",
  "customer_po", "end_user_po", "serial", "claimed_by", "claimed_at",
  "imported_at", "notes",
];

function normalize(rec) {
  const out = {};
  for (const c of COLUMNS) out[c] = String(rec[c] ?? "");
  return out;
}

globalThis.__papitaTests = globalThis.__papitaTests || [];
const test = (name, fn) => globalThis.__papitaTests.push({ name, fn });

test("csv: round-trip 3 records with all 12 fields", () => {
  const input = [
    {
      auth_code: "ABCD1234", part_number: "PAN-PA-440", description: "Firewall",
      order_number: "SO-1", order_date: "2025-01-02", customer_po: "CPO-1",
      end_user_po: "EPO-1", serial: "SN001", claimed_by: "alice",
      claimed_at: "2025-02-01T10:00:00Z", imported_at: "2025-01-15T00:00:00Z",
      notes: "ok",
    },
    {
      auth_code: "EFGH5678", part_number: "PA-450R", description: "Rugged",
      order_number: "SO-2", order_date: "2025-01-03", customer_po: "CPO-2",
      end_user_po: "EPO-2", serial: "", claimed_by: "",
      claimed_at: "", imported_at: "2025-01-15T00:00:00Z", notes: "",
    },
    {
      auth_code: "IJKL9012", part_number: "SVC-PREM", description: "Support",
      order_number: "SO-3", order_date: "2025-01-04", customer_po: "",
      end_user_po: "", serial: "SN003", claimed_by: "bob",
      claimed_at: "2025-02-02T10:00:00Z", imported_at: "2025-01-15T00:00:00Z",
      notes: "n/a",
    },
  ];
  const csv = encode(input);
  const out = decode(csv);
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.records.map(normalize), input.map(normalize));
});

test("csv: escape edge cases (comma, quote, newline)", () => {
  const input = [{
    auth_code: "ABCD1234", part_number: "PN", description: 'has, "quote" and\nnewline',
    order_number: "", order_date: "", customer_po: "", end_user_po: "",
    serial: "", claimed_by: "", claimed_at: "", imported_at: "",
    notes: 'multi,line\n"q"',
  }];
  const csv = encode(input);
  const out = decode(csv);
  assert.deepEqual(out.errors, []);
  assert.equal(out.records[0].description, input[0].description);
  assert.equal(out.records[0].notes, input[0].notes);
});

test("csv: injection guard prefixes apostrophe and round-trip strips it", () => {
  const input = [{
    auth_code: "ABCD1234", part_number: "=DANGER()", description: "+CMD",
    order_number: "", order_date: "", customer_po: "", end_user_po: "",
    serial: "", claimed_by: "", claimed_at: "", imported_at: "", notes: "",
  }];
  const csv = encode(input);
  // Find data row
  const lines = csv.split("\n");
  const dataRow = lines[1];
  const cells = dataRow.split(",");
  assert.equal(cells[1], "'=DANGER()", "part_number cell should start with apostrophe");
  assert.equal(cells[2], "'+CMD", "description cell should start with apostrophe");
  const out = decode(csv);
  assert.deepEqual(out.errors, []);
  assert.equal(out.records[0].part_number, "=DANGER()");
  assert.equal(out.records[0].description, "+CMD");
});

test("csv: round-trip preserves leading apostrophe in non-injection cells", () => {
  const input = [{
    auth_code: "ABCD1234", part_number: "PN", description: "d",
    order_number: "", order_date: "", customer_po: "", end_user_po: "",
    serial: "", claimed_by: "", claimed_at: "", imported_at: "",
    notes: "'pending",
  }];
  const csv = encode(input);
  const out = decode(csv);
  assert.deepEqual(out.errors, []);
  assert.equal(out.records[0].notes, "'pending");
});

test("csv: atomic rejection when auth_code column missing", () => {
  const csv = "part_number,description,order_number,order_date,customer_po,end_user_po,serial,claimed_by,claimed_at,imported_at,notes\nPN,desc,,,,,,,,,\n";
  const out = decode(csv);
  assert.deepEqual(out.records, []);
  assert.ok(out.errors.length > 0);
});

test("csv: atomic rejection on wrong cell count", () => {
  const header = COLUMNS.join(",");
  const badRow = "ABCD1234,PN,desc"; // too few cells
  const csv = header + "\n" + badRow + "\n";
  const out = decode(csv);
  assert.deepEqual(out.records, []);
  assert.ok(out.errors.length > 0);
});
