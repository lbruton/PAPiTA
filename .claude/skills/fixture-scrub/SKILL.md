---
name: fixture-scrub
description: Sanitize a sensitive Palo Alto PDF/CSV into a committable fixture under examples/. Strips customer names, POs, serials, emails, and any PII, then writes the redacted copy to examples/ (the only path whitelisted in .gitignore). Use when the user wants to turn real work data into a regression fixture.
disable-model-invocation: true
---

# fixture-scrub

Turn a sensitive source PDF or CSV into a safe, committable fixture.

## Rules

- Source files live outside the repo or under `CoWork/` — NEVER copy them verbatim.
- Output path is always `examples/<shortname>.{pdf,csv}`. This path is whitelisted in `.gitignore` via `!examples/**`.
- If the output would contain any of the following, redact before writing:
  - Customer / end-user company names → `ACME-CUSTOMER`, `ACME-ENDUSER`
  - PO numbers (customer_po, end_user_po) → `PO-0001`, `PO-0002`
  - Serial numbers → `SN-XXXX####` (preserve format length)
  - Email addresses → `user@example.com`
  - Phone numbers → `555-0100`
  - Street addresses → `123 Example St`
  - Auth codes → preserve prefix, randomize suffix (format matters for parser tests)

## Steps

1. Ask the user for the source file path if not provided.
2. Confirm the destination name: `examples/<shortname>.{pdf,csv}`.
3. For CSV: read, apply redactions column-by-column, write.
4. For PDF: prefer extracting text via `vendor/pdfjs`, redact, and emit a text fixture (`examples/<shortname>.txt`) UNLESS the user explicitly needs a binary PDF — in which case warn that PDF redaction is imperfect and offer to regenerate a synthetic PDF instead.
5. Show the user a diff/summary of what was redacted before writing.
6. After writing, run `git check-ignore examples/<file>` to confirm it is NOT ignored (should exit non-zero).
7. STOP. Do not stage or commit — user reviews first.

## Guardrails

- Never write redacted output anywhere except `examples/`.
- Never `git add` the original source file.
- If the source path is inside `CoWork/`, treat it as sensitive by default.
