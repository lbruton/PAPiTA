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

## Tests

```bash
node test/run.mjs
```

Tests live in `test/`. Runner loads `test/store.test.mjs` and `test/e2e.test.mjs`. Uses Node built-in `assert` only — no test framework. Add new tests to the relevant file using the existing `test(name, fn)` helper pattern.

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

**Color values** (hex, rgb/rgba, hsl/hsla) in component CSS must reference canonical tokens via `var(--*)`. CSS keywords like `transparent`, `currentColor`, `inherit`, and `initial` are allowed since they're not brand values. Themes are values-only adapters (`css/theme-<brand>.css`). Verify before any CSS commit:

```bash
grep -rnE '(#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|hsl\(|hsla\()' css/components/
# Must return ZERO matches.
```

If you need a color that has no token, add a token to `css/tokens.css` AND `css/theme-spacex.css` AND `DESIGN.md`. Reference all brand color values through tokens; keep component CSS free of hardcoded color values.

## Record Schema

Each record has: `auth_code`, `part_number`, `description`, `order_number`, `order_date`, `customer_po`, `end_user_po`, `serial`, `claimed_by`, `claimed_at`, `imported_at`, `purchased_at`, `expires_at`, `notes`. Stored in `localStorage` under key `pan-auth-tracker-v1` with `schema_version: 1`. CSV column order matches this exactly.

## Workflow

- **PRs are required for `main`** — branch protection enforced (confirmed in PR #2). Use feature branch + PR workflow; all changes go through pull requests.
- All feature work happens in `.worktrees/<branch-name>` git worktrees. Edit feature branches only; keep main pristine.
- A `dev` branch exists but is currently fast-forwarded to match `main` — open a PR to `dev` if it diverges.
- PAPiTA is unversioned by design (single-user tool) — do not create `devops/version.lock`.
- Issue prefix `PAP` — issues live in DocVault at `Projects/PAPiTA/Issues/`

## Important Constraints

- Keep it lean — vanilla HTML/CSS/ES modules, one vendored dep (pdf.js), no frameworks, no bundlers
- Single-user tool — no auth, no backend, no cloud sync
- Source PDFs and exported CSVs contain sensitive customer data — `.gitignore` excludes `*.pdf`, `*.csv`, `CoWork/`. Ensure sensitive files stay out of version control.
- Render user-supplied strings via `escapeHtml` — use this for all user input. Assign to text content, not HTML properties.
- All `localStorage` access wrapped in try/catch; warnings flow through `store.subscribeWarnings`
- `normalizeAuthCode` collapses ALL whitespace (including internal) via `replace(/\s+/g, "")` before validating against `^[A-Z0-9]{8}$` — PDF text-layer extraction sometimes splits cells with stray internal spaces
- **Subscriber registration order:** Call `store.subscribe(...)` and `store.subscribeWarnings(...)` before `store.loadFromStorage()`. Startup warnings (storage-unavailable, corrupt-payload) emit during `loadFromStorage()` and require subscribers to be wired first.

## Open Follow-Ups

- **PAP-5** — add Purchase Date and Term (Days) columns to tracker table

## Gotcha: Security Hook + Agent Docs

A user-level security-reminder hook prevents `Write`/`Edit` commits when content literally names certain dangerous JS APIs (dynamic code evaluators, the document-write sink, and HTML-string assignment sinks) — even inside agent definitions, comments, or checklists. When authoring `.claude/agents/security-reviewer.md` or similar audit docs, refer to these as "dynamic-code-evaluation primitives" / "unsafe HTML sinks" rather than naming them literally. Meta: writing *this very paragraph* triggers the hook if you spell the APIs out.

