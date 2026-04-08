// Smoke tests for parser regex/heuristics — replicated inline (helpers not exported).
import assert from "node:assert/strict";

const AUTH_RE = /^[A-Z0-9]{8}$/;
const PART_RE = /^[A-Z0-9][A-Z0-9-]{2,}$/i;
function isValidPartNumber(s) {
  if (!PART_RE.test(s)) return false;
  return /-/.test(s) || /^PAN-/i.test(s);
}

globalThis.__papitaTests = globalThis.__papitaTests || [];
const test = (name, fn) => globalThis.__papitaTests.push({ name, fn });

test("parser regex: auth code positive matches", () => {
  for (const s of ["ABCD1234", "00000000", "AAAAAAAA", "36E93695"]) {
    assert.ok(AUTH_RE.test(s), `${s} should match`);
  }
});

test("parser regex: auth code negative matches", () => {
  for (const s of ["abcd1234", "ABCD123", "ABCD12345", "ABCD-123", ""]) {
    assert.ok(!AUTH_RE.test(s), `${s} should NOT match`);
  }
});

test("parser regex: part number heuristic accepts valid", () => {
  for (const s of ["PAN-PA-440", "PA-450R", "SVC-PREM"]) {
    assert.ok(isValidPartNumber(s), `${s} should be accepted`);
  }
});

test("parser regex: part number heuristic rejects invalid", () => {
  for (const s of ["Customer PO Number", "123", "description"]) {
    assert.ok(!isValidPartNumber(s), `${s} should be rejected`);
  }
});
