// Dataset store — in-memory records with localStorage persistence.
// Pure data layer: no DOM, no HTML. Survives corrupt JSON, missing
// localStorage, and quota errors without throwing.

import { normalizeAuthCode } from "./utils/escape.js";
import { nowIso } from "./utils/time.js";

/**
 * Parse subscription term days from description string.
 * Patterns:
 *   - "X year (Y months) term" → X × 365 days (months ignored)
 *   - "X year term" → X × 365 days
 *   - "X months term" → X × 30 days (fallback, no years)
 * @param {string} description - Description field from record
 * @returns {number|null} - Term days or null if not found
 */
function parseTermDays(description) {
  if (!description || typeof description !== "string") {
    return null;
  }

  // Try years first (with optional months in parentheses)
  const yearMatch = description.match(/(?:(\d+)\s*year\s*(?:\((\d+)\s*months\)\s*)?term)/i);
  if (yearMatch) {
    const years = parseInt(yearMatch[1], 10);
    return years * 365;
  }

  // Fallback to months only
  const monthMatch = description.match(/(?:(\d+)\s*months?\s*term)/i);
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    return months * 30;
  }

  return null;
}

const STORAGE_KEY = "pan-auth-tracker-v1";
const SCHEMA_VERSION = 1;

let records = [];
const subscribers = new Set();
const warnings = new Set();
let storageUnavailableWarned = false;

function hasLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch (_err) {
    return false;
  }
}

function emitWarning(event) {
  if (event && event.type === "storage-unavailable") {
    if (storageUnavailableWarned) return;
    storageUnavailableWarned = true;
  }
  for (const fn of warnings) {
    try {
      fn(event);
    } catch (_err) {
      // Swallow subscriber errors.
    }
  }
}

function notify() {
  const snapshot = getAll();
  for (const fn of subscribers) {
    try {
      fn(snapshot);
    } catch (_err) {
      // Swallow subscriber errors.
    }
  }
}

function persist() {
  if (!hasLocalStorage()) {
    emitWarning({ type: "storage-unavailable" });
    return;
  }
  try {
    const payload = JSON.stringify({
      schema_version: SCHEMA_VERSION,
      records,
      last_saved_at: nowIso(),
    });
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (_err) {
    emitWarning({ type: "quota-exceeded" });
  }
}

export function loadFromStorage() {
  if (!hasLocalStorage()) {
    emitWarning({ type: "storage-unavailable" });
    return { ok: true, hydrated: false, warning: "storage-unavailable" };
  }

  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (_err) {
    emitWarning({ type: "storage-unavailable" });
    return { ok: true, hydrated: false, warning: "storage-unavailable" };
  }

  if (raw === null || raw === undefined) {
    records = [];
    return { ok: true, hydrated: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    records = [];
    emitWarning({ type: "corrupt-payload" });
    return { ok: false, error: "Corrupt localStorage payload" };
  }

  if (!parsed || parsed.schema_version !== SCHEMA_VERSION) {
    records = [];
    const found = parsed && parsed.schema_version != null ? parsed.schema_version : "unknown";
    emitWarning({
      type: "corrupt-payload",
      message: `Stored data has an incompatible schema version (found v${found}, expected v${SCHEMA_VERSION}). Click Recover to export raw or clear.`,
    });
    return { ok: false, error: "Incompatible schema version" };
  }

  records = Array.isArray(parsed.records) ? parsed.records : [];
  // Backward-compat: default claimed_by to empty string on older payloads.
  for (const rec of records) {
    if (rec && typeof rec === "object" && rec.claimed_by === undefined) {
      rec.claimed_by = "";
    }
    if (rec && typeof rec === "object" && rec.customer_po === undefined) {
      rec.customer_po = "";
    }
    if (rec && typeof rec === "object" && rec.end_user_po === undefined) {
      rec.end_user_po = "";
    }
    if (rec && typeof rec === "object" && rec.purchased_at === undefined) {
      rec.purchased_at = "";
    }
    if (rec && typeof rec === "object" && rec.expires_at === undefined) {
      rec.expires_at = "";
    }
  }
  return { ok: true, hydrated: true, count: records.length };
}

export function getAll() {
  return [...records];
}

export function getByAuthCode(authCode) {
  let normalized;
  try {
    normalized = normalizeAuthCode(authCode);
  } catch (_err) {
    return undefined;
  }
  return records.find((r) => r.auth_code === normalized);
}

export function upsertMany(newRecords, { mergeStrategy = "claimed_at_wins" } = {}) {
  void mergeStrategy; // Only one strategy supported for MVP.
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  const list = Array.isArray(newRecords) ? newRecords : [];
  for (const incoming of list) {
    let normalized;
    try {
      normalized = normalizeAuthCode(incoming && incoming.auth_code);
    } catch (_err) {
      skipped += 1;
      continue;
    }
    const candidate = { ...incoming, auth_code: normalized };
    const idx = records.findIndex((r) => r.auth_code === normalized);
    if (idx === -1) {
      records.push(candidate);
      added += 1;
      continue;
    }
    const existing = records[idx];
    const incomingClaimed = candidate.claimed_at || "";
    const existingClaimed = existing.claimed_at || "";

    // Compare claim timestamps using Date.parse with lex fallback.
    let incomingWinsClaim = false;
    if (incomingClaimed) {
      if (!existingClaimed) {
        incomingWinsClaim = true;
      } else {
        const a = Date.parse(incomingClaimed);
        const b = Date.parse(existingClaimed);
        if (Number.isNaN(a) || Number.isNaN(b)) {
          incomingWinsClaim = incomingClaimed > existingClaimed;
        } else {
          incomingWinsClaim = a > b;
        }
      }
    }

    // Always refresh metadata from incoming. Claim block is governed
    // separately by the claimed_at_wins rule.
    const merged = { ...existing };
    const metadataKeys = [
      "part_number",
      "description",
      "order_number",
      "order_date",
      "customer_po",
      "end_user_po",
      "purchased_at",
      "expires_at",
      "notes",
    ];
    for (const k of metadataKeys) {
      if (k in candidate) merged[k] = candidate[k];
    }

    // Parse term and calculate expiration if purchased_at is set.
    const days = parseTermDays(candidate.description);
    if (days !== null && candidate.purchased_at && candidate.purchased_at.trim() !== "") {
      const purchased = new Date(candidate.purchased_at);
      if (!Number.isNaN(purchased.getTime())) {
        const expires = new Date(purchased);
        expires.setDate(expires.getDate() + days);
        merged.expires_at = expires.toISOString().slice(0, 10);
      }
    } else if (days === null && /\d+\s*(year|month)\s*term/i.test(candidate.description || "")) {
      // Term-like text found but parsing failed — add note.
      merged.notes = (merged.notes || "") + "\nCould not parse term from description.";
    }

    if (incomingWinsClaim) {
      // Do not restore a claim if the incoming serial is currently held by a
      // different record — this preserves overrides across CSV re-imports.
      const serialHolder = candidate.serial
        ? records.find((r) => r.auth_code !== normalized && r.serial === candidate.serial)
        : null;
      if (!serialHolder) {
        merged.serial = candidate.serial || "";
        merged.claimed_at = candidate.claimed_at || "";
        merged.claimed_by = candidate.claimed_by || "";
      }
    }
    records[idx] = merged;
    updated += 1;
  }

  persist();
  notify();
  return { added, skipped, updated, errors };
}

export function claim(authCode, serial, { override = false, claimedBy = "" } = {}) {
  let normalized;
  try {
    normalized = normalizeAuthCode(authCode);
  } catch (_err) {
    return { ok: false, error: "Invalid auth code" };
  }
  const trimmed = typeof serial === "string" ? serial.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Serial required" };
  }
  const target = records.find((r) => r.auth_code === normalized);
  if (!target) {
    return { ok: false, error: "Unknown auth code" };
  }
  const conflict = records.find(
    (r) => r.auth_code !== normalized && r.serial === trimmed,
  );
  if (conflict && override !== true) {
    return {
      ok: false,
      conflict: {
        authCode: conflict.auth_code,
        serial: trimmed,
        claimedBy: conflict.claimed_by || "",
        claimedAt: conflict.claimed_at || "",
        partNumber: conflict.part_number || "",
        description: conflict.description || "",
      },
    };
  }
  const now = nowIso();
  if (conflict) {
    conflict.serial = "";
    conflict.claimed_at = "";
    conflict.claimed_by = "";
    conflict.notes = "";
    const annotation = `Reclaimed from ${conflict.auth_code} on ${now.slice(0, 10)}`;
    target.notes = target.notes ? `${target.notes}\n${annotation}` : annotation;
  }
  target.serial = trimmed;
  target.claimed_at = now;
  target.claimed_by = typeof claimedBy === "string" ? claimedBy.trim() : "";
  persist();
  notify();
  return { ok: true };
}

export function unclaim(authCode) {
  let normalized;
  try {
    normalized = normalizeAuthCode(authCode);
  } catch (_err) {
    return { ok: false, error: "Unknown auth code" };
  }
  const target = records.find((r) => r.auth_code === normalized);
  if (!target) {
    return { ok: false, error: "Unknown auth code" };
  }
  target.serial = "";
  target.claimed_at = "";
  target.claimed_by = "";
  persist();
  notify();
  return { ok: true };
}

export function subscribe(fn) {
  subscribers.add(fn);
  return function unsubscribe() {
    subscribers.delete(fn);
  };
}

export function subscribeWarnings(fn) {
  warnings.add(fn);
  return function unsubscribe() {
    warnings.delete(fn);
  };
}

export function exportSnapshot() {
  return JSON.stringify({
    schema_version: SCHEMA_VERSION,
    records,
    last_saved_at: nowIso(),
  });
}

export function importSnapshot(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (_err) {
    return { ok: false, error: "Corrupt snapshot payload" };
  }
  if (!parsed || parsed.schema_version !== SCHEMA_VERSION) {
    return { ok: false, error: "Incompatible schema version" };
  }
  if (!Array.isArray(parsed.records)) {
    return { ok: false, error: "Snapshot missing records array" };
  }
  records = parsed.records;
  persist();
  notify();
  return { ok: true };
}
