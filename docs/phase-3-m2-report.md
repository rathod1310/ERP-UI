# Phase 3 · M2 Report: Theme Collection

Milestone M2 of the approved [ERPNext Experience Collection](https://claude.ai/artifact/WVDmh5ejkhFpCqmYmYK576) proposal: designed themes instead of recoloured presets, dark variants, backdrops, the custom colour engine and the migration from the Phase 1 presets. Desk/home designs (M3), login layouts (M4) and the Studio (M5) come next.

## Status

**Implemented and verified on `ci-test.local` (Frappe 16.34.0 / ERPNext 16.35.0).** Not installed on `ai-erpnext.local`; nothing committed.

| Suite | Result |
| --- | --- |
| Backend (`run-tests --app erpnext_ui`) | 102 integration + 29 unit, OK |
| Frontend unit (`node --test tests/js/*.test.mjs`) | 90/90 |
| Browser, M2 (`tests/browser/phase3m2.mjs`) | 16/16 |
| Browser, milestone 1 / Phase 2 / Phase 1 (regression) | 17/17 / 31/31 / 21/21 |

## Decisions taken

The proposal's seven open decisions were not answered individually; the approval ("start implement") was read as accepting its recommended options. Those that affect M2:

1. **Collection:** the six themes, with dark variants of Corporate Blue, Slate Professional, Executive Green and Modern Office (ten themes in total). Midnight Navy and Clear Contrast are not built.
2. **Phase 1 presets:** retired. Patch `v0_4` disables their records and moves site defaults and every user's saved choice: Classic Light and Professional Blue → Corporate Blue, Neutral Grey → Slate Professional, Soft Green → Executive Green, Professional Dark and Classic Dark → Graphite Dark. Records are kept, so custom themes based on them still resolve, and an administrator can enable them again.
6. **Fonts:** no downloads. Warm Classic's serif headings and Graphite Dark's monospaced figures use system font stacks (Source Serif / Georgia, Plex Mono / SFMono / Menlo / Consolas) with fallbacks.

## What was built

### Themes as designs (recipes)

A theme is now a palette, a shape and a **recipe**: nine structural choices, each implemented once and selected through `html[data-ui-t-<name>]`.

| Recipe | Options |
| --- | --- |
| Sidebar | Attached, Attached Gradient (brand fill), Floating (rounded inset panel) |
| Page header | Solid, Translucent (blurred), Transparent |
| Cards | Bordered, Raised, Flat |
| Fields | Outlined, Filled, Underline |
| Tables | Lined, Zebra, Rows (each list row a card), Ruled (2 px rule under the header) |
| Buttons | Square, Rounded, Pill |
| Backdrop | None, Subtle Gradient, Soft Geometric, Fine Texture, Paper Grain, Minimal Abstract, Neutral Mesh |
| Heading font | Body Font, Serif |
| Numerals | Proportional, Tabular Mono |

| Theme | Mode | Recipe |
| --- | --- | --- |
| Corporate Blue | Light + Dark | navy gradient sidebar, bordered cards, outlined fields, lined tables, soft geometric backdrop |
| Slate Professional | Light + Dark | grey sidebar with solid slate active item, flat cards, filled fields, zebra tables, square buttons, dot texture |
| Warm Classic | Light | espresso sidebar with brass active item, warm paper surfaces, underlined fields, ruled tables, serif headings, paper grain |
| Executive Green | Light + Dark | forest gradient sidebar, raised cards, translucent header, filled fields, rows as cards |
| Graphite Dark | Dark | three-step graphite surfaces, filled fields, monospaced figures, abstract glow |
| Modern Office | Light + Dark | floating sidebar panel, transparent header, raised cards, 12 px corners, pill buttons, neutral mesh |

**Sidebar colour roles.** Three new theme tokens: `sidebar-text`, `sidebar-active-bg` and `sidebar-active-text`. They make dark and brand-filled sidebars possible, and they are contrast-checked (4.5:1). Inside the sidebar, Frappe's `--ink-gray-*` text utilities are mapped to the sidebar text role, so icons, labels and the user block stay readable on any fill. Themes that only set `sidebar-bg` (Phase 1 custom themes) get derived roles.

**Backdrops** are CSS gradients, plus one ~400-byte inline SVG for grain, painted on a fixed layer behind the Desk. Page-level containers turn transparent; cards, forms, tables and menus stay opaque. New settings: **Enable Backdrops** (on) and **Show Backdrop Through Sidebar and Header** (off). A Plain page background, a layout option, also suppresses the backdrop.

### Custom colour engine

`theme/generator.py` takes primary, secondary, Light/Dark and Subtle/Strong, and produces a complete theme with every role derived and moved to its contrast floor. It refuses rather than return an unreadable theme. A one-off fuzz of 1,240 random combinations produced 0 refusals and 0 contrast failures; the unit test generates about 500 on every run.

Administrators use it from **UI Experience Settings → Create Theme from Colours**: the Desk behind the dialog previews the theme live, the dialog shows the contrast report, and **Create Theme** saves a custom UI Theme. APIs: `erpnext_ui.api.theme.generate_theme` (read-only) and `create_custom_theme`, both requiring create permission on UI Theme.

## Files

**New:**
- `theme/generator.py`
- `css/adapters/v16/recipes.scss`
- `patches/v0_4/theme_collection.py`
- tests: `test_collection.py`, `js/recipes.test.mjs`, `browser/phase3m2.mjs`
- this report

**Changed:**

| Area | Files |
| --- | --- |
| Theme definitions and resolution | `theme/presets.py` (the collection), `theme/tokens.py` (sidebar roles, `RECIPES`), `theme/resolver.py` (recipes, sidebar derivation, contrast rules), `core/themes.py` (recipe in the catalog) |
| Settings and storage | `core/settings.py` and `core/config.py` (backdrop settings and payload), `install.py` (sync recipes), `api/theme.py` (generator APIs), `patches.txt` |
| DocTypes | UI Theme (sidebar roles, recipe fields; JS duplicates them), UI Experience Settings (backdrop section; colour dialog and layout status) |
| Browser engine and styles | `public/js/theme/{engine,resolve}.js` (recipe attributes, backdrop switches), `css/adapters/v16/layout/sidebar.scss` (sidebar roles), `css/tokens/typography.scss` (serif and mono stacks), gallery sidebar preview |
| Tests and docs | backend tests renamed to the new themes, browser suites (new theme names; the page colour is read from `<html>` because backdrops make the body transparent), `docs/design-system.md` |

## Verification

**Contrast**, measured in the browser for each theme (13 pairs, including sidebar text, active menu item, pills, help text and text on the page). Every pair passes its floor. Body text is 13–16:1, sidebar pairs 7–10:1 and status pills 5.5:1 or higher; full figures are in the M2 run log.

**Browser checks per theme:** the recipe attributes equal the catalog, and each treatment really renders:
- floating panel radius, gradient sidebar, backdrop layer, no shadow on flat cards
- zebra alternation, row cards, 2 px ruled header
- underline fields, pill buttons, monospaced numbers
- no white surfaces in dark themes

Screenshots of the workspace, Sales Invoice list, submitted Sales Invoice form and Sales Register report for all ten themes are in `docs/screenshots/phase-3-m2/` (`<theme>-1…4-*.png`), plus the gallery, the colour-engine preview, the generated theme in use, backdrops through panels and three theme × layout combinations.

Regression suites needed their expectations updated, not the product: the Phase 1 default button colour (now Corporate Blue), the number of theme cards (10), the gradient sidebar (a background image) and the active menu item (now the theme's `sidebar-active-bg`).

## Known limitations

- **Sites not yet migrated:** the app code is shared by every site on the bench. Since M2 the theme catalog reads only the UI Theme columns that exist, so a site still on an older schema keeps working with its current themes until it is migrated (seen on `ai-erpnext.local`, where erpnext_ui was installed at Phase 1 and not migrated since).

- **Report tables** keep tabular figures but not the monospaced face: Frappe's datatable gives cells no type class, so numbers cannot be told apart from text there.
- **Warm Classic's serif** uses the system serif (Georgia on most systems) until fonts are approved for self-hosting.
- **Translucent and transparent page headers** rely on `backdrop-filter`. Browsers without it show a slightly see-through header.
- **Phase 1 custom themes** keep their old look (neutral recipe, derived sidebar roles) until an administrator edits their recipe.
- The **Floating sidebar** is inset on tablets and desktops only; phones keep Frappe's overlay.
- `bench start` was stopped during this milestone, so assets were built with `bench build --app erpnext_ui`.

## Next

M3: home designs (Tile, Executive Overview, Minimal) and workspace designs (Classic, Modern, Department), built from native, permission-filtered data.
