# PAPiTA — Palo Alto Inventory Tracking Assistant

## What it does

PAPiTA is a lightweight, browser-only tool for wrangling Palo Alto Networks firewall auth-code and inventory data. It ingests vendor PDFs and CSVs, normalizes the records into a single table, lets you claim serials against auth codes, and exports the results — all without a backend, an account, or a network round-trip.

## Run it

Serve the directory with any static file server, for example:

```
python3 -m http.server 8765
```

Then open <http://localhost:8765/>.

Alternatively, deploy the directory as-is to GitHub Pages — no build step required.

## Offline

PAPiTA works with zero network access after the first load. All dependencies are vendored under `vendor/` and shipped with the repository.

## Vendored Dependencies

| Library | Version | Source |
|---------|---------|--------|
| pdf.js  | v4.10.38 | <https://github.com/mozilla/pdf.js/releases> |

## Data privacy — READ THIS

Vendor PDFs and exported CSVs from PAPiTA contain **sensitive customer and licensing data**. Treat them accordingly:

- **Never** commit vendor PDFs to this repository.
- **Never** commit exported CSVs containing real customer data.
- The `.gitignore` excludes `*.pdf`, `*.csv`, and the `CoWork/` scratch directory by default — but discipline matters more than tooling. Double-check `git status` before every commit.

## Architecture at a glance

See [`DESIGN.md`](./DESIGN.md) for the design-system contract (token vocabulary, theme adapter pattern, component specs).

The full specification lives in DocVault under `specflow/PAPiTA/specs/PAP-1-build-pan-auth-tracker-mvp/`. A read-only mirror exists in this repo under `specs/PAP-1-build-pan-auth-tracker-mvp/`.

## Status

MVP delivered (PR #1).
