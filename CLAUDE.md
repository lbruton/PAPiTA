# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What This Is

**PAPiTA — Palo Alto Professional Inventory Tracking Aid** (internally: "Ben's Palos are a Pain in the Ass" app). Single-page, client-side web app for reconciling Palo Alto Networks vendor auth codes against physical device serial numbers during rack-and-stack. Built for one coworker; no auth, no backend.

## Run It

```bash
python3 -m http.server 8765
# then open http://localhost:8765/
```

Also deploys as-is to GitHub Pages — zero build step.

## Smoke Tests

```bash
node specs/PAP-1-build-pan-auth-tracker-mvp/artifacts/smoke/run.mjs
# Expect: "20 passed, 0 failed"
```

Smoke scripts live under spec artifacts (NOT in a `test/` folder). PAPiTA deliberately ships no in-repo test framework — node + `assert` only.

## Architecture

See `DESIGN.md` for the design-system contract (token vocabulary, theme adapter pattern, component specs). Full spec lives in DocVault under `specflow/PAPiTA/specs/PAP-1-build-pan-auth-tracker-mvp/`.

Module map:
- `js/store.js` — single source of truth + localStorage with corrupt-payload recovery
- `js/parser.js` — pdf.js text-layer extraction with anti-label header filter
- `js/csv.js` — RFC 4180 codec with CSV-injection guard
- `js/render.js` — table render loop, sort, filter, event delegation
- `js/claim.js` — claim/unclaim flow + duplicate-serial modal
- `js/app.js` — entry wiring (no business logic)
- `js/utils/{escape,time,dom}.js` — tiny shared helpers
- `vendor/pdfjs/` — pinned pdf.js v4.10.38 legacy ESM build

## Token-Adapter CSS Invariant (CRITICAL)

Component CSS references **only** canonical tokens via `var(--*)`. Themes are values-only adapters (`css/theme-<brand>.css`). Verify before any CSS commit:

```bash
grep -rnE '(#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\()' css/components/
# Must return ZERO matches.
```

If you need a value that has no token, add a token to `css/tokens.css` AND `css/theme-spacex.css` AND `DESIGN.md`. Never inline brand values in component CSS.

## Record Schema

Each record has: `auth_code`, `part_number`, `description`, `order_number`, `order_date`, `customer_po`, `end_user_po`, `serial`, `claimed_by`, `claimed_at`, `imported_at`, `notes`. Stored in `localStorage` under key `pan-auth-tracker-v1` with `schema_version: 1`. CSV column order matches this exactly.

## Workflow

- Branch protection: PRs target `main` (dev exists but is small enough to push direct to main; PR back to dev only if it diverges)
- All feature work in `.worktrees/<branch-name>` worktrees — never edit on main
- No `devops/version.lock` — PAPiTA is unversioned by design (single-user tool)
- Issue prefix `PAP` — issues live in DocVault at `Projects/PAPiTA/Issues/`

## Important Constraints

- Keep it lean — vanilla HTML/CSS/ES modules, one vendored dep (pdf.js), no frameworks, no bundlers
- Single-user tool — no auth, no backend, no cloud sync
- Source PDFs and exported CSVs contain sensitive customer data — `.gitignore` excludes `*.pdf`, `*.csv`, `CoWork/`. Never commit them.
- Render user-supplied strings ONLY via `escapeHtml` — never `innerHTML` with raw values
- All `localStorage` access wrapped in try/catch; warnings flow through `store.subscribeWarnings`

## Open Follow-Ups

- **PAP-2** — duplicate-serial override should clear prior claim
- **PAP-3** — calculate license expiration from purchase date + term days

## Required Environment Variables

None.
