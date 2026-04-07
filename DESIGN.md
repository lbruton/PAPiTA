# PAPiTA Design System

> Contract between component CSS and theme adapters. Components reference only canonical tokens — themes populate them.

## Architecture — Token Adapter Pattern

PAPiTA's CSS is layered: `tokens.css` declares the canonical token vocabulary as empty CSS custom properties on `:root`; one `theme-<name>.css` adapter populates those tokens with concrete values; component stylesheets under `css/components/` reference only `var(--token)` and never hard-code colors, fonts, or spacing. The theme adapter loads last in `index.html` so its values override any fallbacks. To swap themes, swap the single `<link>` — no component CSS edits required.

## Canonical Token Vocabulary

| Token | Purpose |
|-------|---------|
| `--bg` | page background |
| `--bg-elevated` | modal / overlay surfaces |
| `--text` | primary text |
| `--text-muted` | secondary text, placeholder |
| `--border` | table and input borders |
| `--btn-bg` | ghost-button background |
| `--btn-border` | ghost-button border |
| `--btn-bg-hover` | ghost-button hover |
| `--claimed-bg` | claimed-row background tint |
| `--danger` | duplicate-serial warning, error banner |
| `--overlay` | modal backdrop |
| `--font-sans` | body / UI font stack |
| `--font-mono` | auth codes, serials |
| `--space-1` | 4px spacing step |
| `--space-2` | 8px spacing step |
| `--space-3` | 12px spacing step |
| `--space-4` | 16px spacing step |
| `--space-5` | 24px spacing step |
| `--space-6` | 32px spacing step |
| `--radius-sm` | small border radius |
| `--radius-md` | medium border radius |

## Component Specs

### Toolbar
- **Structure:** wordmark + ghost buttons + filter input
- **Tokens consumed:** `--bg`, `--text`, `--btn-bg`, `--btn-border`, `--btn-bg-hover`, `--font-sans`, `--space-*`
- **Deviations:** mixed-case label text (vs canonical all-caps)

### Table
- **Structure:** sticky header, thin borders, claimed-row state tint
- **Tokens consumed:** `--bg`, `--text`, `--border`, `--claimed-bg`, `--font-mono` (auth_code & serial columns), `--font-sans`, `--space-*`
- **Deviations:** mixed-case data rows (readability), claimed-row state color added (not in source DESIGN.md)

### Claim Form
- **Structure:** inline serial input on the row, Save / Cancel actions
- **Tokens consumed:** `--bg-elevated`, `--text`, `--border`, `--btn-bg`, `--btn-border`, `--font-mono`
- **Deviations:** none

### Modal (duplicate-serial override + storage recovery)
- **Structure:** full-screen overlay + centered panel + actions
- **Tokens consumed:** `--overlay`, `--bg-elevated`, `--text`, `--border`, `--btn-bg`, `--btn-border`, `--danger`
- **Deviations:** none

## Documented Deviations from Canonical SpaceX

- Mixed-case table data rows (canonical SpaceX uses all-caps; we prioritize readability for 8-char auth codes adjacent to serials)
- Claimed-row state color `--claimed-bg` (not present in source DESIGN.md — new semantic for PAPiTA)
- Thin table borders with sticky header (SpaceX uses borderless layout; we need column separation for a 7-column data grid)
- `Rajdhani` substituted for commercial D-DIN (free webfont, similar condensed geometry)

## Initial Theme: SpaceX

The initial `theme-spacex.css` adapter populates the canonical tokens from the SpaceX palette (`#000000` bg, `#f0f0fa` text, ghost-button rgba values). See `/Volumes/DATA/GitHub/DocVault/KnowledgeBase/awesome-design-md/design-md/spacex/DESIGN.md` for upstream. The adapter is a single values-only file — future themes can ship as additional `theme-<name>.css` files without touching any component CSS.

## Adding a New Theme

1. Copy `css/theme-spacex.css` to `css/theme-<name>.css`
2. Replace every token value
3. Swap the `<link>` in `index.html`

No component CSS edits required. If you find yourself needing to edit component CSS to make a theme work, that's a bug in the token vocabulary — add a missing token to `tokens.css` and `DESIGN.md` instead.
