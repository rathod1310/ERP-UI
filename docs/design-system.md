# Design System

## Principles

1. **Productivity first.** Density, alignment and readable type come before decoration.
2. **Restraint.** No neon and no motion beyond short state transitions (disabled under `prefers-reduced-motion`). Since Phase 3 a theme may use a gradient brand sidebar, a translucent page header and a quiet backdrop behind the Desk; content cards, forms, tables and menus always stay opaque.
3. **Consistency.** A component looks the same everywhere because it reads the same token.
4. **Readable contrast.** Every theme meets the contrast rules below. Automated tests enforce them for the presets, and saving a custom theme enforces them too.
5. **Familiarity.** Native ERPNext layout and behaviour are kept. Themes change how things look, not where they are.
6. **Designs, not recolours.** Each theme in the collection has its own recipe (sidebar, page header, cards, fields, tables, buttons, backdrop, type), so switching themes changes more than the hue.

## Token architecture

All tokens are CSS custom properties prefixed `--ui-`.

| Kind | Where defined | Varies by |
| --- | --- | --- |
| Theme tokens (colours, radius, shadows, heading weight, colour scheme) | `theme/presets.py` / UI Theme records → written by the engine for the active theme | theme |
| Theme recipe (structural treatments) | `theme/tokens.py` `RECIPES`, chosen per theme → `html[data-ui-t-*]`, rules in `css/adapters/v16/recipes.scss` | theme |
| Derived colour states | `public/css/tokens/colors.scss` (`color-mix`) | theme (computed) |
| Typography, layout, component tokens | `public/css/tokens/*.scss` | font / density attribute |

`theme/tokens.py` is the registry. `THEME_COLOR_TOKENS` lists the per-theme colours, and `STATIC_TOKENS` lists the CSS-declared tokens by category. A new theme only needs a UI Theme record. No CSS file is edited.

## Colour tokens (per theme)

| Token | Use |
| --- | --- |
| `primary` | Brand accent: primary buttons, selection, checkboxes, progress |
| `primary-contrast` | Text and icons on `primary` |
| `secondary` | Secondary accent (swatches, future secondary actions) |
| `background` | Page background behind cards (Phase 2 layouts) |
| `surface` | Cards, forms, lists, the main content area |
| `surface-elevated` | Dialogs, popovers, toasts |
| `surface-muted` | Subtle fills (section headers, skeletons) |
| `control-bg` | Input and default-button fill |
| `navbar-bg`, `sidebar-bg` | Chrome areas |
| `sidebar-text`, `sidebar-active-bg`, `sidebar-active-text` | Sidebar text, active menu item fill and its text (Phase 3; derived from `sidebar-bg` when a theme leaves them blank) |
| `text`, `text-secondary`, `text-muted` | Text hierarchy |
| `border`, `border-strong` | Dividers, input and table borders |
| `success`, `warning`, `danger`, `info` | Semantic colours |
| `hover`, `focus`, `disabled-bg`, `disabled-text` | Interaction states |

Derived in CSS: `primary-hover`, `primary-active`, `primary-soft`, `selected`, `*-soft` semantic fills, the `neutral-1…4` grey scale and `focus-ring`. The hover and active states mix towards `--ui-text`, so they darken in light themes and lighten in dark themes from a single rule.

### Contrast rules (WCAG 2.1 ratios)

| Pair | Minimum |
| --- | --- |
| text on surface / background | 7.0 (AAA) |
| text-secondary on surface / background | 4.5 (AA) |
| text-muted on surface | 3.0 (non-essential text) |
| primary-contrast on primary | 4.5 |
| primary, focus, danger, success, warning, info on surface | 3.0 (non-text UI, WCAG 1.4.11) |
| sidebar-text on sidebar-bg, sidebar-active-text on sidebar-active-bg | 4.5 |

Defined once in `theme/resolver.py` (`CONTRAST_RULES`). The accent override keeps these rules by adjusting the accent's lightness and choosing white or near-black for button text.

## Typography

| Token | Default |
| --- | --- |
| `font-family` | Inter (bundled with Frappe); options: System UI, Humanist Sans (OS fonts) |
| `font-size-xs/sm/base/md/lg/xl/2xl` | 12 / 13 / 14 / 14 / 16 / 18 / 22 px (Frappe v16 scale) |
| `font-weight-regular/medium/semibold/bold` | 420 (400 for system fonts) / 500 / 600 / 700 |
| `line-height-tight/base/relaxed` | 1.25 / 1.5 / 1.65 |
| `heading-1…4-size` | 24 / 20 / 16 / 14 px |
| `heading-weight` | per theme (500 / 600 / 700) |
| `label-size`, `label-weight`, `table-font-size` | 12 px, 500, 13 px |

No font is downloaded from a CDN.

## Layout

| Token | Default |
| --- | --- |
| `sidebar-width` / `sidebar-width-compact` | 240 / 56 px |
| `navbar-height` | 48 px (native) |
| `page-padding`, `section-spacing` | 20 / 24 px |
| `content-max-width` | 1440 px (workspaces; whole page with *Contained* width) |
| `page-head-height` | = `navbar-height` (the v16 page header is the top bar) |
| `card-padding` | 16 px (12 px below 992 px) |
| `sidebar-item-height` | control height + 2 px (follows density) |
| `gap-xs…xl` | 4 / 8 / 12 / 16 / 24 px |
| `breakpoint-sm/md/lg/xl` | 576 / 768 / 992 / 1200 px (reference values; `@media` cannot read custom properties) |

The Desk layout layer (`css/adapters/v16/`, see [desk-layout.md](desk-layout.md)) consumes these tokens. Below 992 px `page-padding` is 12 px, below 768 px 8 px.

## Component tokens

| Token | Value |
| --- | --- |
| `radius` | per theme (0–12 px) |
| `radius-sm / md / lg` | radius−2 (min 2) / radius / radius+2 |
| `card-radius`, `input-radius`, `dialog-radius` | lg / md / radius+4 |
| `border-width` | 1 px |
| `shadow-sm / md / lg` | per theme: shadow style (Flat / Subtle / Raised) × mode |
| `icon-size-sm/md/lg` | 14 / 16 / 20 px |
| `button-height`, `input-height`, `table-row-height`, `table-cell-padding-*` | from density |

## Derived text roles (Phase 2)

Declared in `tokens/colors.scss` and computed by the browser from each theme's base colours, so custom themes get them too.

| Token | Rule | Use |
| --- | --- | --- |
| `text-subtle` | `text-muted` mixed 12 % towards `text` | muted *text*: help, breadcrumbs, counts, timestamps. `text-muted` stays for icons |
| `primary-text` | `primary` in light themes; 60 % `primary` + 40 % `text` in dark themes | primary used as a text colour: active tab, active menu item, link hover |
| `on-success/danger/warning/info` | semantic colour mixed 22 % towards `text` | status pill labels on the matching `*-soft` fill |

Measured in the browser for all six presets, every text pair used by the layout reaches 4.5:1 (body text at least 13.4:1); see the table in [phase-2-report.md](phase-2-report.md). Without `text-subtle`, Classic Light help text measured 4.46:1; without `primary-text`, the active menu item in the dark presets measured 3.1:1.

## Density

| | Compact | Comfortable (native) | Spacious |
| --- | --- | --- | --- |
| control height | 26 px | 28 px | 32 px |
| small control | 22 px | 24 px | 28 px |
| table row (also list rows, Phase 2) | 30 px | 36 px | 42 px |
| cell padding y / x | 5 / 8 | 8 / 10 | 10 / 12 |

## Theme standards

A theme is acceptable when:

- all colour tokens are set (custom themes may inherit through **Based On**; sidebar roles may be left to derivation);
- every contrast rule passes, including the sidebar pairs;
- light themes keep a light page (background luminance > 0.85) and dark themes a dark one (< 0.02);
- radius stays within 0–12 px and the shadow style is one of Flat, Subtle or Raised;
- the recipe uses only options from `RECIPES`.

## Theme recipes

| Recipe field | Options | Attribute |
| --- | --- | --- |
| Sidebar style | Attached, Attached Gradient, Floating | `data-ui-t-sidebar` |
| Page header style | Solid, Translucent, Transparent | `data-ui-t-navbar` |
| Card style | Bordered, Raised, Flat | `data-ui-t-surface` |
| Field style | Outlined, Filled, Underline | `data-ui-t-input` |
| Table style | Lined, Zebra, Rows (each row a card), Ruled (2 px rule under the header) | `data-ui-t-table` |
| Button shape | Square, Rounded, Pill | `data-ui-t-button` |
| Backdrop | None, Subtle Gradient, Soft Geometric, Fine Texture, Paper Grain, Minimal Abstract, Neutral Mesh | `data-ui-t-backdrop` |
| Heading font | Body Font, Serif (system serif stack, nothing downloaded) | `data-ui-t-heading` |
| Numerals | Proportional, Tabular Mono (numbers in lists, child tables, number fields and number cards) | `data-ui-t-numerals` |

Backdrops are CSS gradients or one ~400-byte inline SVG on a fixed layer behind the Desk; the page-level containers become transparent and every card stays opaque. **Enable Backdrops** (UI Experience Settings) switches them off site-wide; **Show Backdrop Through Sidebar and Header** makes those two panels slightly translucent. A Plain page background (layout option) also hides the backdrop.

## The theme collection

| Theme | Mode | Primary | Recipe |
| --- | --- | --- | --- |
| Corporate Blue | Light (+ Dark) | navy `#1d4f91` | navy gradient sidebar, bordered cards, outlined fields, lined tables, soft geometric backdrop |
| Slate Professional | Light (+ Dark) | slate `#334155` | grey sidebar with solid slate active item, flat cards, filled fields, zebra tables, square buttons, dot texture |
| Warm Classic | Light | oxblood `#7a2e2a` | espresso sidebar with brass active item, warm paper surfaces, underlined fields, ruled tables, serif headings, paper grain |
| Executive Green | Light (+ Dark) | forest `#1f5f46` | forest gradient sidebar, raised cards, translucent header, filled fields, rows as cards, subtle gradient |
| Graphite Dark | Dark | blue `#5b9cf0` | three-step graphite surfaces, filled fields, monospaced figures, abstract glow |
| Modern Office | Light (+ Dark) | indigo `#4338ca` | floating sidebar panel, transparent header, raised cards with 12 px corners, pill buttons, neutral mesh |

Corporate Blue and Graphite Dark are the fallbacks. The six Phase 1 presets were retired by patch `v0_4` (records disabled, users and site defaults moved: Classic Light and Professional Blue → Corporate Blue, Neutral Grey → Slate Professional, Soft Green → Executive Green, Professional Dark and Classic Dark → Graphite Dark).

## Custom colour engine

`theme/generator.py` turns a primary and a secondary colour, a mode (Light, Dark) and a treatment (Subtle, Strong) into a complete theme. Canvas, surfaces, text, borders, sidebar roles, states and semantic colours are derived; each derived colour is moved towards black or white until it reaches its contrast floor, and `generate()` refuses (ValueError) rather than return an unreadable theme. Subtle keeps surfaces neutral and puts the colour in accents; Strong fills the sidebar with the primary (darkened until white text reads at 7:1), tints the page and adds the gradient backdrop. A unit test generates about 500 themes from fixed and random colours and checks every one against the contrast rules.

Administrators use it from **UI Experience Settings → Create Theme from Colours**: every change is previewed on the Desk behind the dialog with its contrast report, and **Create Theme** saves it as a custom UI Theme (`erpnext_ui.api.theme.generate_theme` / `create_custom_theme`, permission: create UI Theme).
