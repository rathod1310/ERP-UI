# Compatibility

## Version support

| Frappe | ERPNext | Status |
| --- | --- | --- |
| 16.34.0 | 16.35.0 | **Tested** (backend, frontend unit, browser end-to-end) |
| other 16.x | 16.x | Adapter `v16` is selected. Expected to work but not tested; the adapter maps variables that may change between minor releases |
| 15.x | 15.x | **Not supported.** No adapter; engine stays inactive, native Desk |
| 17.x / develop | – | **Not supported.** No adapter; engine stays inactive, native Desk |

HRMS 17.0.0-dev (develop branch) was installed on the test site and its pages loaded without errors. There is no HRMS-specific integration.

Python: the code is written for Python 3.10+ (`requires-python >= 3.10`), so a future v15 adapter needs no syntax changes. Frappe v16 itself requires 3.14; this bench runs 3.14.

## Adapter architecture

```
server: core/compat.py   ADAPTERS = {16: "v16"}  ->  boot.erpnext_ui.adapter
browser: adapters/index.js  ADAPTERS = { v16 }   ->  selectAdapter(config, env)
                                                    = server key AND adapter.detect(env)
```

- **Shared:** token registry, presets, resolver, engine, preferences, gallery. None of these know about Frappe's DOM.
- **Per version:** `adapters/<key>.js` (feature detection, route hook, menu entry) and `css/adapters/<key>.scss` (variable mapping plus scoped component rules), active only under `html[data-ui-adapter="<key>"]`.
- `v16.detect()` requires `frappe.ui.set_theme`, `frappe.router.on` and `frappe.boot`. If any of them is missing the engine stays inactive, even on v16.

Adding a version: test it, add `ADAPTERS[n]` in `core/compat.py`, add `adapters/vN.js`, `css/adapters/vN.scss` and an entry in `adapters/index.js`, extend `TESTED`, and update this file.

## What the v16 adapter covers

Native components that read the mapped Frappe variables change with the theme: page and form surfaces, text hierarchy, borders, inputs and controls, default and primary buttons, dropdowns and popovers, modals, toasts, the sidebar (espresso `--surface-*` / `--ink-gray-*` scale), checkboxes, progress bars, alerts, focus rings, scrollbars, radii, shadows, font family, and input/button height (density).

Scoped component rules (where a native rule hard-codes a colour):

- `.btn.btn-primary`: label colour (`--ui-primary-contrast`), hover and active states;
- page, modal and widget titles: theme heading weight.

## Desk layout layer (Phase 2)

`css/adapters/v16/` restyles the v16 page structure, sidebar, page header, workspaces, forms, child tables, lists, reports and shared components; details and integration points are in [desk-layout.md](desk-layout.md). It applies only with the v16 adapter and **Enhanced Desk Layout** on.

Additional variables mapped by the layer: `--sidebar-hover-color`, `--sidebar-active-color`, `--sidebar-border-color`, `--divider-color`, `--sidebar-width`, `--page-head-height`, `--list-row-height`, the `--dt-*` datatable variables, and the semantic indicator pairs `--bg-<colour>` / `--text-on-<colour>` for green, red, orange, yellow, blue, gray/grey and darkgrey.

## Known limitations

- **Page background:** native Desk assumes `--bg-color` equals `--fg-color`, so both still map to the surface. Since Phase 2 the layout layer paints `--ui-background` on the page-level containers only. With **Enhanced Desk Layout** off, the page stays the surface colour.
- **Not themed (keep native colours):** decorative indicator colours (cyan, pink, purple, light blue; the semantic ones are mapped by the layout layer), Frappe Charts colours, the rich-text (Quill) editor toolbar in dark themes (stays near-black), print formats, the login page, website/portal pages, and anything inside iframes.
- **Density** changes input and button heights through Frappe's `--input-height` / `--btn-height`, and (with the layout layer) list row and sidebar item heights. Places where Frappe uses compiled SCSS values (`$input-height`) or fixed pixel sizes do not change.
- **Splash screen:** drawn before any script, using Frappe's light or dark colours from `User.desk_theme`. If a user never chose an appearance and the site default is Dark, the splash is light for that load.
- **Accent override** applies to every theme. There is no per-theme or per-user accent in Phase 1.
- **Fonts:** System UI and Humanist Sans depend on fonts installed on the user's device.
- **Theme names** are not translatable data. They are passed through `__()` when shown, so translations can be added in the app's translation files.

## Unsupported components (Phase 1)

Login page, website and portal, web forms, print formats and PDF, email templates, the Frappe UI (Vue) apps under `/helpdesk`, `/crm` and similar, and the POS page layout.

## Compatibility testing

| Check | How | Result |
| --- | --- | --- |
| Install on a site with frappe, erpnext, hrms, ai_erpnext, proposals, business_health_checkup | `bench --site ci-test.local install-app erpnext_ui` (fresh, after uninstall) | OK |
| App-only migrate twice | `sync_for("erpnext_ui")` + `after_migrate()` | OK, idempotent |
| Native ERPNext pages | Browser: Customer list, Sales Invoice form, General Ledger report, Accounting workspace, ToDo list and form | Rendered, no JavaScript errors |
| Native theme switcher | Browser: `frappe.ui.ThemeSwitcher` | Engine follows it; choice persisted |
| Coexisting app tests | `bench --site ci-test.local run-tests --app proposals` | 17/17 OK |
| Disable | Browser: settings `enabled = 0` | No `data-ui-*` attributes, no style element, native `--primary` |
| Unsupported version | Unit tests: payload with `adapter: null`, server `adapter_key("15.x"/"17.x")` | Engine inactive |

A full `bench migrate` (all apps) was not run, to avoid applying other apps' pending patches on the shared test site.
