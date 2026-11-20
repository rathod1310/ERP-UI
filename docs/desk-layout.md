# Desk Layout Layer (Phase 2)

The Desk layout layer changes how Frappe v16 Desk is laid out and presented. It does not change what Desk does: no form, list, report, workspace or permission logic is replaced, and no DocType or workspace record is modified.

## How it is switched on

```
UI Experience Settings ──► boot payload: layout = { enabled, width }
                                   │
theme engine (apply) ──► <html data-ui-layout="enhanced" data-ui-width="full|contained">
                                   │
CSS: every rule is prefixed with
     html[data-ui-adapter="v16"][data-ui-layout="enhanced"]
```

- The prefix requires both the v16 adapter and the layout flag. If the engine is disabled, fails, or runs on an unsupported Frappe version, none of these rules match and Desk keeps its native look.
- **Enhanced Desk Layout** off: theme colours, density and font still apply (Phase 1 behaviour); the layout rules do not.
- The prefix has specificity (0,2,1). That beats Frappe's class rules without `!important`. Where a native rule is nested more deeply (the workspace headings and grid), the same selector chain is repeated under the prefix.
- Colours, sizes and spacing come only from `--ui-*` tokens, so every theme, including custom ones, is covered without per-theme CSS.

## Layout presets and formats (Phase 3, milestone 1)

Seven independent categories, each an attribute on `<html>` set by the layout engine. A preset is only a value for each category (`theme/layouts.py`). "Standard" values are the Phase 2 Desk.

| Category | Options | Effect |
| --- | --- | --- |
| Navigation (`data-ui-nav`) | Standard, Compact, Collapsed | 240 px sidebar; 200 px sidebar with smaller items; sidebar collapsed through Frappe's own API (the user can still expand it) |
| Workspace (`data-ui-workspace`) | Standard, Cards, Compact, Comfortable | 12 px grid; raised cards with 64 px shortcuts; 8 px grid with 36 px shortcuts; 20 px grid with more padding |
| Forms (`data-ui-form`) | Standard, Compact, Comfortable | field height from density; 26 px fields and tighter spacing; 34 px fields and roomier sections. Set on the form only, so dialogs keep the density |
| Lists and tables (`data-ui-list`) | Standard, Compact, Comfortable | list row height from density; 28 px rows; 46 px rows; matching datatable cell padding |
| Content width (`data-ui-width`) | Standard, Full Width, Contained, Narrow | page full width with readable form and workspace widths; everything full width; at most 1440 px; at most 1120 px |
| Cards (`data-ui-cards`) | Bordered, Minimal | border and soft shadow; no border or shadow (workspace widgets keep a hairline) |
| Page background (`data-ui-canvas`) | Tinted, Plain | `--ui-background` behind cards; the card colour, like native ERPNext |

| Preset | Navigation | Workspace | Forms | Lists | Width | Cards | Background |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Classic | Standard | Standard | Comfortable | Standard | Standard | Minimal | Plain |
| Modern (default, = Phase 2) | Standard | Standard | Standard | Standard | Standard | Bordered | Tinted |
| Compact | Compact | Compact | Compact | Compact | Standard | Bordered | Tinted |
| Wide | Collapsed | Standard | Standard | Standard | Full Width | Bordered | Tinted |

Rules: `css/adapters/v16/formats.scss`. **Top navigation is not offered**: v16 has no top bar, and building one would mean moving Frappe's search, notifications and user menu out of the sidebar, which this app avoids.

## Files

```
public/css/adapters/v16/
├── gate.scss                 $desk selector prefix
├── index.scss                imports the partials below (bundle: erpnext_ui.bundle.scss)
├── layout/desk.scss          A  page background, gutters, content cards, width
├── layout/sidebar.scss       B  sidebar, active/hover states, nested sections, filter box
├── layout/page-head.scss     C  page header (the v16 top bar), breadcrumbs, actions
├── layout/workspace.scss     D  workspace grid, headings, shortcuts, links, number cards, charts
├── components/controls.scss  H  buttons, inputs, read-only values, invalid state
├── components/overlays.scss  H  dropdowns, dialogs, popovers, toasts, tooltips, date picker, autocomplete
├── components/indicators.scss H status pills, badges
├── components/forms.scss     E  form/activity/sidebar cards, tabs, sections, labels, timeline
├── components/grid.scss      E  child tables
├── components/lists.scss     F  list views
├── components/reports.scss   G  query/script reports, datatables, summaries
├── components/feedback.scss  H  empty states, loading skeletons, cards
├── formats.scss                 layout presets and formats (Phase 3)
└── responsive.scss              tablet (< 992 px) and phone (< 768 px)
public/js/adapters/v16/navigation.js   B  sidebar menu filter, tooltips for truncated labels
```

## Integration points used

| Need | Frappe v16 extension point |
| --- | --- |
| Load CSS/JS on every Desk page | `app_include_css` / `app_include_js` hooks |
| Configuration without a request | `extend_bootinfo` hook |
| Page-type scoping | `body[data-route]` and `.page-container[data-page-route]`, set by Frappe's router |
| Re-applying after navigation | `frappe.router.on("change")` (Phase 1 adapter) |
| Sidebar re-render | the document event `sidebar_setup`, triggered by `frappe.ui.Sidebar.setup()` |
| Theme variables of native widgets | Frappe CSS variables (`--bg-color`, `--sidebar-*-color`, `--bg-<colour>`, `--text-on-<colour>`, `--dt-*`, `--list-row-height`, `--page-head-height`, `--sidebar-width`) |

No Frappe or ERPNext file is modified, no native controller is replaced, and no DOM element is moved.

## Module notes

### A. Global Desk layout

v16 uses `--bg-color` both for the page and for components that sit on it (the awesomplete list, the sticky right column of list rows, datatables, timeline dots, popover headers, the notifications panel). Re-pointing `--bg-color` at the tinted page colour would tint all of those, so it stays the surface colour. The page colour (`--ui-background`) is painted on `html`, `body`, `.main-section` and `.page-container` only.

The content of every page (`.layout-main-section`) becomes a card: surface, 1 px border, card radius, small shadow. Exceptions: workspaces (their widgets are the cards) and forms (the form, the activity area and the form sidebar are separate cards). Page header and body share one horizontal gutter (`--ui-page-padding`), so titles line up with the card edge. *Contained* width limits header and body to `--ui-content-max-width` + gutters.

### B. Sidebar and navigation

The native v16 sidebar is kept: workspace switcher, role-filtered items, nested sections, the collapse toggle (state in `localStorage`), and the mobile overlay. The layer sets the width (`--ui-sidebar-width`, 240 px), item height (follows density), icon and text colours, a tinted active item, hover states, guide lines for nested sections, and the user block.

**Menu filter** (`navigation.js`): when a workspace sidebar has 10 or more items, a filter box appears above them. It hides non-matching items with a class and opens a collapsed section when a match is inside it (with its own class, so Frappe's collapsed state is not changed). Enter opens the first match and Escape clears the filter. It filters only what Frappe has already rendered for the user, so it cannot show anything the user may not see. It is reset whenever Frappe rebuilds the sidebar. Truncated labels get their full text as a tooltip on hover (one delegated listener).

### C. Navbar and page header

v16 has no global navbar: brand, search (Ctrl+K), notifications and the user menu are in the sidebar. Theme access is the user-menu entry **Appearance & Theme** (Phase 1) and Frappe's own **Toggle Theme**. The sticky `.page-head` is the top bar: fixed height, navbar surface, bottom border. Breadcrumbs have one size; earlier crumbs are muted and the current page (list title, document title or report name) is in the text colour. Status pills keep their position. Actions use one height and one gap. All native buttons, menus and keyboard shortcuts stay as they are.

### D. Workspaces

Section headings are in the text colour. Every widget (shortcut, link card, number card, chart, quick list) is a card with the same border, radius and shadow. Shortcuts have the same height, link cards highlight the hovered link, number cards show tabular figures, and spacer blocks stay invisible. The grid uses a 12 px gap and lines up with the page header. Workspaces use the content width (1440 px) instead of Frappe's 900 px. Edit mode (the native workspace editor) is not changed. Workspace records are never written.

### E. Forms and document views

Cards for the form, the activity area (comments and timeline) and the form sidebar. Tabs: secondary text, primary underline on the active tab. Section headings in the text colour; labels in secondary text and the label weight; the required mark in the danger colour; help text in `--ui-text-subtle`.

Editable inputs are bordered surfaces with hover and focus states. Read-only values (read-only fields and submitted documents) have a muted fill, no border and full-contrast text; natively they were grey on grey. Fields marked *Bold* in the DocType stay bold. Invalid fields (Frappe's `.has-error`) get a danger border; Frappe only sets it after interaction or a failed save. Currency, Float, Int and Percent values use tabular figures.

Child tables: muted header row, row hover, a selected-row tint, borderless cells while editing with an inset focus ring, and themed footer buttons and expanded row form. Frappe hard-codes a white control background for editable rows (marked "TODO: Dark and Light Mode" in Frappe); the layer replaces it with the surface token, so editing works in dark themes.

### F. List views

The filter bar sits inside the card with a bottom border. The header row is muted with smaller semibold labels, and it stays sticky (native). Row height follows density (`--ui-row-height`: 30 / 36 / 42 px). Rows highlight on hover, selected rows are tinted, and the sticky right column follows the row colour. Subject links are medium weight, numbers use tabular figures, and paging buttons show the active page size. Wide lists scroll sideways inside the list (native), not the page. Filters, saved filters, sorting, selection, bulk actions, list settings and list scripts are untouched.

### G. Reports

Datatable variables (`--dt-*`) are mapped to tokens; the header row is muted and semibold, all cells use tabular figures, the totals row is semibold on a muted fill, and row hover is themed. Inline filter and edit inputs stay borderless. The report sits in a bordered, rounded frame inside the card. Report summaries, the chart area and the footer use the same tokens. Report filters, queries, calculations, exports and print are untouched.

### H. Shared components

| Component | Treatment |
| --- | --- |
| Buttons | primary filled; secondary/default outlined (inset ring, so widths do not change); ghost/link tertiary; destructive in the danger colour (dark label in dark themes); disabled at 55 % opacity |
| Inputs | default / hover / focus ring / disabled and read-only / invalid |
| Dropdown and context menus, popovers, date picker, autocomplete | elevated surface, border, medium shadow, themed hover/active, so they are never white in dark themes |
| Dialogs and confirmations | elevated surface, header and footer separators, dialog radius |
| Toasts | elevated surface with a semantic left edge (success, danger, warning, info) |
| Tooltips | inverted (text colour background) |
| Status pills | green → success, red → danger, orange/yellow → warning, blue → info, grey → neutral, via Frappe's `--bg-<colour>` / `--text-on-<colour>`; decorative colours (cyan, pink, purple, light blue) keep Frappe's palette |
| Empty states, skeletons, cards | token colours |

## Responsive behaviour

| Width | Behaviour |
| --- | --- |
| ≥ 992 px | desktop layout |
| < 992 px | gutters and card padding 12 px; the form uses the full width (natively it kept space for the form sidebar, which is an overlay at this width); the form sidebar card stacks |
| < 768 px | gutters 8 px, smaller breadcrumbs, dialogs use the screen width; Frappe's mobile sidebar overlay and mobile list layout are kept |

The browser suite checks tablet (900 px) and phone (390 px) widths for workspaces, lists, forms and reports: no horizontal page overflow, and the primary action stays visible.

## Known limitations

- **v16 only.** The layer is written against the v16 DOM. Other major versions get no layout (and no theme) until an adapter exists.
- **Page header as navbar.** There is no global top bar in v16. Adding one would mean moving native elements, which this phase avoids.
- **Not restyled:** the workspace editor (edit mode), the form builder, the print preview, the POS page, Kanban/Calendar/Gantt/Image views beyond shared components, Frappe Charts colours, the rich-text (Quill) toolbar in dark themes, website/portal pages, and the login page (Phase 3).
- **Unsaved previews end on a full page reload.** A preview lives in memory and survives in-app navigation, but not a browser reload.
- **Route filters on Link fields.** `/app/sales-invoice?customer=<missing value>` leaves a stale filter in `cur_list.filters` while the list shows all rows. This is native Frappe behaviour, seen during testing and not caused by this app.
- **Bundle size.** The CSS layer is 51.9 KB minified because the 56-character prefix repeats on every selector; gzipped it is 5.5 KB. A shorter prefix would lower specificity and need `!important` in many places.
