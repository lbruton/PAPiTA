---
name: pdf-parse-debug
description: Dump PDF.js text items with coordinates, fonts, and page numbers to debug parser row-detection and column-mapping work in js/parser.js. Use when investigating parser regressions, adding new header columns, or diagnosing why a specific PDF produces wrong CSV output.
---

# pdf-parse-debug

Inspect a PDF through the vendored PDF.js the same way `js/parser.js` sees it, so regex and row-detection logic can be debugged against ground truth.

## When to use

- A fixture in `examples/` parses incorrectly.
- Adding or reordering header columns (e.g. recent `customer_po` / `end_user_po` work).
- A smoke test in `specs/PAP-1-*/artifacts/smoke/parser-row-regex.test.mjs` fails and the regex needs to be reworked.

## Steps

1. Accept a PDF path (default: prompt the user; prefer `examples/` fixtures).
2. Use Node + `vendor/pdfjs/build/pdf.mjs` (or the file that exists under `vendor/pdfjs/`) to load the doc. If the vendor build is browser-only, fall back to running the dump inside a headless Playwright page that loads `index.html` with the fixture preloaded.
3. For each page, emit one line per text item:
   `page=<n> x=<x> y=<y> w=<w> h=<h> font=<fontName> str="<text>"`
4. Group items into visual rows (same y within tolerance) and print a second view:
   `row=<i> y=<y> cols=[str1 | str2 | str3 ...]`
5. Highlight any rows that DO match and DO NOT match the current regex in `js/parser.js` (read the regex at runtime — do not hardcode).
6. Output to stdout; do not write files unless the user asks.

## Notes

- This is a read-only diagnostic. Do not modify `js/parser.js` from this skill — report findings and let the user or a follow-up task make the fix.
- Keep output under ~200 lines; if the PDF is large, page-limit and tell the user how to re-run for specific pages.
