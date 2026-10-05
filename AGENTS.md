# Repository Guidelines

## Project Structure & Module Organization
`main` currently contains project scaffolding plus planning files (`CLAUDE.md`, `.specflow/`, `.claude/`). The active MVP worktree shows the intended layout for the app: `index.html` at the root, browser modules in `js/`, shared helpers in `js/utils/`, styles in `css/` and `css/components/`, vendored libraries in `vendor/`, and spec artifacts in `specs/`. Keep the app browser-only unless a backend is unavoidable.

## Build, Test, and Development Commands
There is no build step by design. Run the app with a static server:

```sh
python3 -m http.server 8765
```

Open `http://localhost:8765/` to test locally. For smoke checks, run the lightweight Node harness used by the MVP worktree:

```sh
node specs/PAP-1-build-pan-auth-tracker-mvp/artifacts/smoke/run.mjs
```

This validates core parsing, CSV, and store behavior without introducing a full test runner.

## Coding Style & Naming Conventions
Use vanilla HTML, CSS, and ES modules. Prefer 2-space indentation in HTML/CSS and match the existing style in JavaScript. Use lowercase kebab-case for CSS files (`claim-form.css`), concise noun-based module names for browser logic (`parser.js`, `store.js`), and keep utilities under `js/utils/`. Favor small, dependency-free modules and clear DOM IDs over framework abstractions.

## Testing Guidelines
Add focused smoke tests as `*.test.mjs` files beside the existing spec artifacts. Name tests after the module or behavior they cover, for example `csv.test.mjs` or `parser-row-regex.test.mjs`. Cover parsing edge cases, CSV safety, and claim-state persistence before UI polish. If you add new import/export logic, include at least one happy-path and one rejection-path test.

## Commit & Pull Request Guidelines
Follow the current commit style: `type: short summary` (example: `chore: initial PAPiTA scaffold`). Keep commits small and descriptive. Pull requests should explain the user-visible change, note any sensitive-data handling concerns, link the related issue/spec, and include screenshots or short screen recordings for UI changes.

## Security & Data Handling
Never commit real vendor PDFs, exported CSVs, or coworker scratch files. The repository ignores `*.pdf`, `*.csv`, and `CoWork/`, but always review `git status` before committing. Vendor third-party browser dependencies under `vendor/` so the tool can stay offline after first load.
