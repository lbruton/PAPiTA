// PDF parser for Palo Alto auth-code inventory PDFs.
// Uses vendored pdf.js (legacy ESM build) for text extraction only.

import { getDocument, GlobalWorkerOptions } from "../vendor/pdfjs/pdf.mjs";
import { normalizeAuthCode } from "./utils/escape.js";
import { nowIso } from "./utils/time.js";

GlobalWorkerOptions.workerSrc = new URL(
  "../vendor/pdfjs/pdf.worker.mjs",
  import.meta.url
).href;

const AUTH_CODE_RE = /^[A-Z0-9]{8}$/;
const HEADER_PATTERNS = [
  "auth code",
  "part number",
  "page",
  "total",
  "order",
];
const ORDER_NUMBER_RE = /Order\s*Number\s*[:#]?\s*(\d+)/i;
const ORDER_DATE_RE = /Order\s*Date\s*[:#]?\s*([0-9A-Za-z\/\-\s,]+?)(?:\s{2,}|$)/i;

function isHeaderRow(cells) {
  if (!cells.length) return true;
  const first = cells[0].toLowerCase();
  return HEADER_PATTERNS.some((p) => first.includes(p));
}

function clusterRows(items) {
  // Group items whose y differs by < 2 units.
  const entries = items
    .filter((it) => it && typeof it.str === "string" && it.str.trim() !== "")
    .map((it) => ({
      x: it.transform[4],
      y: it.transform[5],
      str: it.str.trim(),
    }));
  entries.sort((a, b) => b.y - a.y);
  const rows = [];
  let current = null;
  for (const e of entries) {
    if (current && Math.abs(current.y - e.y) < 2) {
      current.items.push(e);
    } else {
      current = { y: e.y, items: [e] };
      rows.push(current);
    }
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str));
}

function looksLikePartNumber(s) {
  if (!s) return false;
  if (/^PAN-/i.test(s)) return true;
  // Alphanumeric with dashes, at least 4 chars, contains a dash or digit.
  return /^[A-Z0-9][A-Z0-9\-]{3,}$/i.test(s) && /[-0-9]/.test(s);
}

function extractOrderMeta(rows) {
  const meta = { order_number: "", order_date: "" };
  const joined = rows.map((r) => r.join(" ")).join("\n");
  const mNum = joined.match(ORDER_NUMBER_RE);
  if (mNum) meta.order_number = mNum[1].trim();
  const mDate = joined.match(ORDER_DATE_RE);
  if (mDate) meta.order_date = mDate[1].trim();
  return meta;
}

function classifyError(message) {
  const msg = (message || "").toLowerCase();
  if (msg.includes("password") || msg.includes("encrypted")) {
    return "This PDF is password-protected. Remove the password and try again.";
  }
  if (
    msg.includes("invalid") ||
    msg.includes("corrupt") ||
    msg.includes("missing pdf") ||
    msg.includes("malformed")
  ) {
    return "This PDF could not be parsed (file may be corrupt).";
  }
  return "PDF parsing failed: " + message;
}

export async function parseFile(file) {
  const records = [];
  let skipped = 0;

  try {
    const buffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: buffer }).promise;

    let orderMeta = { order_number: "", order_date: "" };
    let firstPageHadNoText = false;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      if (pageNum === 1) {
        if (!textContent.items || textContent.items.length === 0) {
          firstPageHadNoText = true;
        }
      }

      const rows = clusterRows(textContent.items || []);

      if (pageNum === 1) {
        orderMeta = extractOrderMeta(rows);
      }

      for (const cells of rows) {
        if (!cells.length) continue;
        if (isHeaderRow(cells)) continue;

        // Find auth code cell.
        let authIdx = -1;
        for (let i = 0; i < cells.length; i++) {
          const candidate = cells[i].replace(/\s+/g, "");
          if (AUTH_CODE_RE.test(candidate)) {
            authIdx = i;
            break;
          }
        }
        if (authIdx === -1) continue;

        let auth_code;
        try {
          auth_code = normalizeAuthCode(cells[authIdx]);
        } catch (_e) {
          skipped += 1;
          continue;
        }

        // Part number heuristic: prefer neighbor matching PAN-/alphanum-dash.
        const prev = authIdx > 0 ? cells[authIdx - 1] : "";
        const next = authIdx < cells.length - 1 ? cells[authIdx + 1] : "";
        let part_number = "";
        if (looksLikePartNumber(prev)) part_number = prev;
        else if (looksLikePartNumber(next)) part_number = next;
        else part_number = prev || next || "";

        // Description: longest remaining cell.
        let description = "";
        let maxLen = 0;
        for (let i = 0; i < cells.length; i++) {
          if (i === authIdx) continue;
          if (cells[i] === part_number) continue;
          if (cells[i].length > maxLen) {
            maxLen = cells[i].length;
            description = cells[i];
          }
        }

        records.push({
          auth_code,
          part_number,
          description,
          order_number: orderMeta.order_number,
          order_date: orderMeta.order_date,
          serial: "",
          claimed_at: "",
          imported_at: nowIso(),
          notes: "",
        });
      }
    }

    if (firstPageHadNoText && records.length === 0) {
      return {
        records: [],
        skipped: 0,
        error:
          "This PDF has no text layer (scanned image). PAPiTA can't read it.",
      };
    }

    return { records, skipped };
  } catch (e) {
    return {
      records: [],
      skipped: 0,
      error: classifyError(e && e.message ? e.message : String(e)),
    };
  }
}
