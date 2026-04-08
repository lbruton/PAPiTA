# Codacy SRM Skip Justification — PAP-1

PAPiTA has a GitHub remote (`origin = https://github.com/lbruton/PAPiTA.git`) but the repository is brand-new and is not yet registered with Codacy. Codacy SRM scan is therefore skipped for the MVP build.

When the repository is registered with Codacy:
1. Run `/codacy-resolve` against the changed files
2. Triage Critical/High findings
3. Add the results to this file

For now, defensive coding patterns mitigate the most likely findings:
- All user-supplied strings render via `escapeHtml` (no XSS) — see `js/render.js`
- CSV encoder applies CSV-injection guard (`'` prefix on =/+/-/@) — see `js/csv.js`
- localStorage access wrapped in try/catch (no crash on quota/unavailable) — see `js/store.js`
- No `eval`, no dynamic script injection, no third-party CDN at runtime
- pdf.js is the only vendored dep, pinned to v4.10.38 legacy ESM
