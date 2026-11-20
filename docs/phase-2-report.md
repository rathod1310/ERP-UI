# Phase 2 Report: Desk UI Transformation

## 1. Overall status

**Phase 2 is implemented and verified for Frappe 16.34.0 / ERPNext 16.35.0 on the test site `ci-test.local`.** All eight modules are implemented. Every automated suite passes:

| Suite | Result |
| --- | --- |
| Backend, erpnext_ui (`run-tests --app erpnext_ui`) | 70 integration + 15 unit, **OK** (9 new) |
| Frontend unit (`node --test tests/js/*.test.mjs`) | **61/61** (17 new) |
| Browser, Phase 2 (`tests/browser/phase2.mjs`) | **31/31** |
| Browser, Phase 1 (`tests/browser/e2e.mjs`), re-run | **21/21** |
| Coexistence: proposals / business_health_checkup / ai_erpnext | 17 OK / 128 + 59 OK / 694 OK |
| Contrast, all six themes (19 pairs each, in the browser) | **0 failures** |

The app is installed only on `ci-test.local`. It is **not** installed on `ai-erpnext.local`, and nothing has been committed. Both need your approval.

Section 16 lists the limitations. Phase 2 is a presentation layer: it does not restructure form layouts. Fields stay where the DocType puts them, as the brief requires for anything that could affect native behaviour.

## 2. Architecture changes

Phase 2 extends the Phase 1 architecture and replaces no part of it.

```
UI Experience Settings (+ desk_layout, content_width)
        │  core/settings.py → core/config.py: payload.layout = {enabled, width}
        ▼
browser: resolve.normaliseLayout → ThemeEngine.apply()
        │  sets <html data-ui-layout="enhanced" data-ui-width="full|contained">
        ▼
css/adapters/v16/**   every rule prefixed html[data-ui-adapter="v16"][data-ui-layout="enhanced"]
js/adapters/v16/navigation.js   installed once by the v16 adapter
```

- **One switch, two levels.** With the engine off or on an unsupported version, Desk stays native (as in Phase 1). With the engine on but **Enhanced Desk Layout** off, you get Phase 1 theming only. With both on, you get the full Phase 2 layout. Turning the layout off was tested in the browser.
- **Version-specific code stays in the adapter.** All Phase 2 selectors depend on the v16 DOM, so they live under `adapters/v16/`. The engine, the tokens and the Python side stay version-neutral.
- **Tokens only.** Phase 2 CSS contains no colour literals except `#ffffff` for the destructive-button label in light themes. New tokens: `--ui-page-head-height`, `--ui-card-padding`, `--ui-sidebar-item-height`, plus the derived text roles `--ui-text-subtle`, `--ui-primary-text` and `--ui-on-{success,danger,warning,info}`.
- **Upgrade path.** Patch `v0_2.enable_desk_layout` handles sites that had Phase 1 (section 13 explains why it is needed).

## 3. Modules implemented

Details per module are in [desk-layout.md](desk-layout.md).

| Module | What changed |
| --- | --- |
| **A. Global Desk layout** | Tinted page background (`--ui-background`) behind white content cards. Header and body share one gutter, so titles line up with the card edge. Spacing between header and content. Optional *Contained* width (1440 px). The page itself never scrolls sideways (checked at 1366, 900 and 390 px). The background colour is applied without re-pointing `--bg-color` (section 6). |
| **B. Sidebar and navigation** | 240 px width. Item height follows density. Consistent icon and text colours. Tinted active item with primary-text colour. Hover states. Guide lines for nested sections. Restyled collapse toggle. The native collapse, nested sections, role filtering and mobile overlay are kept. **New:** a menu filter for long sidebars (10 or more items; Enter opens the first match, Escape clears). **New:** full-name tooltips on truncated labels. |
| **C. Navbar and page header** | The v16 page header is the top bar: fixed height, navbar surface. Breadcrumbs have one size; earlier crumbs are muted and the current page is in the text colour. Spacing for status pills. One height and one gap for all actions. Theme access stays in the user menu (*Appearance & Theme*, *Toggle Theme*). |
| **D. Workspaces** | Uniform widget cards. Equal-height shortcuts. Section headings in the text colour (natively light grey). 12 px grid aligned with the header. Content width instead of 900 px. Spacer blocks stay invisible. Styled number cards, link cards and chart controls. The workspace editor and records are untouched. |
| **E. Forms and documents** | Separate cards for the form, the activity area and the form sidebar. Primary-underlined tabs. Section headings, labels, required marks and help text. Bordered editable inputs versus muted read-only values with full-contrast text (natively grey on grey). DocType *Bold* respected. Invalid state. Tabular figures in number fields. Styled attachments, timeline and comments. Child tables: header, hover, selection, editing focus ring, footer and expanded row form, with a fix for Frappe's hard-coded white editing background in dark themes. Tablet forms use the full width. |
| **F. List views** | Filter bar inside the card. Muted sticky header row. Row height follows density. Hover, selected-row tint, themed sticky right column. Subject links and tabular figures. Paging. Empty and loading states. |
| **G. Reports** | Datatable variables mapped. Muted semibold header. Tabular figures. Semibold totals row. Themed hover. Framed table. Summary figures, chart area and footer. Inline filters stay borderless. |
| **H. Shared components** | Buttons (primary / secondary-outlined / tertiary / destructive / disabled). Inputs (default / hover / focus / disabled / read-only / invalid). Dropdowns and context menus, popovers, date picker, autocomplete, dialogs and confirmations, toasts, tooltips, semantic status pills, badges, cards, empty states, skeletons. All are token-based and adapt to dark themes. |

## 4. Files created

- CSS: `public/css/adapters/v16/{gate,index,responsive}.scss`, `layout/{desk,sidebar,page-head,workspace}.scss`, `components/{controls,overlays,indicators,forms,grid,lists,reports,feedback}.scss`
- JS: `public/js/adapters/v16/navigation.js`
- Patch: `patches/v0_2/__init__.py`, `patches/v0_2/enable_desk_layout.py`
- Tests: `tests/test_layout.py`, `tests/js/layout.test.mjs`, `tests/browser/harness.mjs` (shared CDP harness, moved out of `e2e.mjs`), `tests/browser/phase2.mjs`, `tests/browser/records.py` (disposable business records)
- Docs: `docs/desk-layout.md`, `docs/phase-2-report.md`, `docs/screenshots/phase-2/*.png`

## 5. Files modified

| File | Change |
| --- | --- |
| `ui_experience_settings.json` | Section "Desk Layout": `desk_layout` (Check, default 1), `content_width` (Full Width / Contained) |
| `core/settings.py`, `core/config.py`, `theme/tokens.py` | Defaults and validation; `layout` in the payload; `CONTENT_WIDTHS`; new static layout tokens |
| `patches.txt` | Registers the patch |
| `public/css/erpnext_ui.bundle.scss` | Imports `adapters/v16/index` |
| `public/css/tokens/layout.scss`, `tokens/colors.scss` | New layout tokens; derived text roles |
| `public/js/theme/resolve.js`, `theme/engine.js` | `normaliseLayout`; engine owns `data-ui-layout` / `data-ui-width` (removed on deactivate) |
| `public/js/adapters/v16.js` | Installs the navigation helper once |
| `tests/browser/e2e.mjs` | Uses `harness.mjs`. Three assertions updated because the page background is now intentionally `--ui-background` (cards are still the surface) |
| `tests/browser/support.py` | The browser admin user also gets Purchase, Stock, Item and Sales User roles, so workspace number cards and the regression workflows can run |
| `README.md`, `docs/architecture.md`, `docs/compatibility.md`, `docs/design-system.md` | Phase 2 sections |

No Frappe or ERPNext file was modified. `git status` in `apps/frappe` and `apps/erpnext` shows two changes that predate this work and that this work did not touch: `frappe/app.py` (2026-10-06) and `erpnext/banking/yarn.lock` (2026-09-18).

## 6. Native Frappe integration points

| Need | Extension point |
| --- | --- |
| Assets | `app_include_css`, `app_include_js` (unchanged from Phase 1) |
| Configuration | `extend_bootinfo` (unchanged; payload gains `layout`) |
| Upgrade | `patches.txt` (post-model-sync), `after_migrate` |
| Page-type scoping | `body[data-route]`, `.page-container[data-page-route]` |
| Navigation | `frappe.router.on("change")`; document event `sidebar_setup` |
| Native variables | `--sidebar-*-color`, `--sidebar-width`, `--page-head-height`, `--list-row-height`, `--dt-*`, `--bg-<colour>` / `--text-on-<colour>` |

**Investigation: page and card colour in v16.** v16 uses `--bg-color` both for the page (`html`, `body`, `.page-container`, `.page-head`) and for components on the page: the awesomplete list, the sticky right column of list rows, datatables, timeline dots, popover headers and the notifications panel. Re-pointing the variable would have tinted all of those. It therefore stays the surface colour, and the page colour is painted on the page-level containers by explicit, scoped rules.

## 7. Bundle sizes

Production-style build (esbuild minify; sass compressed), measured outside the bench so the running `bench watch` was not disturbed:

| Bundle | Phase 1 | Phase 2 | gzip (Phase 2) |
| --- | --- | --- | --- |
| CSS | 12.6 KB | 64.5 KB (layer: 51.9 KB) | 8.1 KB |
| JS | 15.0 KB | 18.2 KB (navigation.js: 3.1 KB) | 6.3 KB |

The CSS growth comes mostly from the 56-character selector prefix, repeated on every rule. It compresses well: the whole layer is 5.5 KB gzipped. For comparison, Frappe's desk CSS is 772 KB in the current development build and about 109 KB gzipped. A shorter prefix would lower specificity and require `!important` throughout, so it was not adopted.

## 8. Theme compatibility

Every Phase 2 colour comes from tokens, so all six presets (and custom themes) are covered by the same rules. Contrast was measured in the browser, which resolves the `color-mix()` values, for each preset:

| Pair | Classic Light | Prof. Blue | Neutral Grey | Soft Green | Prof. Dark | Classic Dark |
| --- | --- | --- | --- | --- | --- | --- |
| text on surface | 14.21 | 14.54 | 15.35 | 14.71 | 13.40 | 13.91 |
| labels (secondary) on surface | 6.75 | 6.93 | 7.16 | 7.09 | 8.53 | 8.61 |
| help / breadcrumbs (subtle) on surface | 5.08 | 5.35 | 5.34 | 5.40 | 6.05 | 6.00 |
| subtle text on muted fill | 4.53 | 4.76 | 4.65 | 4.78 | 5.62 | 5.67 |
| active tab / link (primary-text) | 8.99 | 6.45 | 8.99 | 6.30 | 6.22 | 6.38 |
| read-only value on muted fill | 12.67 | 12.92 | 13.37 | 13.03 | 12.46 | 13.14 |
| list header text on header fill | 6.02 | 6.16 | 6.23 | 6.28 | 7.93 | 8.14 |
| active sidebar item | 7.66 | 5.56 | 7.67 | 5.46 | 5.63 | 5.78 |
| sidebar item text | 6.41 | 6.57 | 6.68 | 6.71 | 8.94 | 8.97 |
| primary button label | 8.99 | 6.45 | 8.99 | 6.30 | 4.72 | 5.02 |
| status pills (success / danger / warning / info / neutral) | 5.42–6.22 | 5.50–6.56 | 5.72–6.37 | 5.43–6.35 | 5.29–7.01 | 5.52–7.24 |
| destructive button label | 5.52 | 5.44 | 5.69 | 5.66 | 5.45 | 5.61 |
| page vs card (separation) | 1.08 | 1.08 | 1.10 | 1.09 | 1.10 | 1.08 |

The first measurement found two failures: Classic Light muted help text (4.46) and the active menu item in both dark presets (3.1 and 3.07). They were fixed with the derived tokens `--ui-text-subtle` and `--ui-primary-text`, not by editing the Phase 1 presets, whose contrast tests (`test_presets.py`) are unchanged and pass. Page-to-card separation is a deliberately subtle luminance step, reinforced by a 1 px border and a small shadow.

Dark-mode surfaces were also checked in the browser. Editable inputs, the autocomplete list, dropdown menus, the date picker and dialogs all use dark surfaces (none is white). Screenshots of one document in each preset (taken by the browser suite): `theme-1…6-*.png`.

## 9. Backend tests

70 integration + 15 unit, OK. New in `test_layout.py` (9 tests):

- defaults and DocType options
- an invalid width falls back
- the payload carries `layout`
- the layout can be off while themes stay on
- a disabled engine sends no layout
- the layout payload contains only `enabled` and `width`
- the patch turns the layout on for an upgraded site
- the patch keeps an administrator's choice
- patch followed by `after_migrate` keeps it on

## 10. Frontend unit tests

61/61. New in `layout.test.mjs` (17 tests):

- layout normalisation (missing block, invalid width)
- engine attributes on, off and toggled through `update()` without reload
- attributes removed on deactivate
- the layout survives previews
- no layout without an adapter
- adapter wiring without a document
- sidebar filter: empty query, child match opens a collapsed section without touching `.hidden`, section match shows and resets children, no match and clearing, threshold

## 11. Browser tests

These ran in a real browser: headless Chromium 1366×900 (plus 900×1000 and 390×844), driven over the DevTools protocol, against `bench --site ci-test.local serve --port 8011`. **31/31** Phase 2 checks:

| Area | Checks |
| --- | --- |
| A | layout attributes; page background vs card surface; title aligned with card; no page overflow |
| D | widgets uniform (border, shortcut height), aligned with header, heading colour, spacer invisible; Selling/Buying/Stock/Invoicing workspaces load without errors |
| B | expanded width 240 px, sidebar and active colours; native collapse/expand (filter hidden when collapsed); filter narrows "analy" to Sales Analytics, never adds or removes items, Escape clears, "no match" message, one box, hidden on short sidebars |
| C | header height and surface, current crumb colour, primary action visible |
| E | see section 13; plus the document view: status pill, Create/menu/print actions visible, timeline and sidebar cards, read-only value colour; custom fields render |
| F | header fill, selected-row tint, bulk *Actions* appears on selection; filters, sort, paging; Item list; empty state |
| G | Sales Register: rows, header fill, tabular figures, semibold totals; General Ledger and Stock Balance execute |
| H | dropdown and dialog surfaces |
| Themes | light screenshot; dark: inputs and autocomplete not white, list and workspace |
| Responsive | tablet 900 px and phone 390 px: workspace, list, form, report have no horizontal overflow; *Add* stays visible |
| Settings | *Contained* limits width at 1920 px; layout off keeps the theme and removes the layout |
| Theme gallery | the submitted invoice in all six presets, each applied and saved through the preferences API |
| Routes | 14 rapid route changes: one filter box, one token style element, layout still on, no errors |
| Coexistence, security | sections 14 and 15 |
| Errors | no JavaScript errors during the run (see note) |

Notes on the run:

- Two kinds of console error are ignored: "Error connecting to socket.io" (the temporary server has no realtime service) and Chrome's autoplay block for Frappe's notification sound.
- The security check provokes three `PermissionError`s on purpose; those are removed from the error list, and any other error still fails.

The Phase 1 suite was re-run after the harness refactor: **21/21**.

### How to repeat

```bash
bench --site ci-test.local serve --port 8011                                  # separate terminal
PW=<random password>
bench --site ci-test.local execute erpnext_ui.tests.browser.support.setup --args "['$PW']"
bench --site ci-test.local execute erpnext_ui.tests.browser.records.setup
node apps/erpnext_ui/erpnext_ui/tests/browser/phase2.mjs --base http://127.0.0.1:8011 \
  --chrome chromium/chrome-linux/headless_shell --password "$PW" --out /tmp/eui-phase2
node apps/erpnext_ui/erpnext_ui/tests/browser/e2e.mjs --base http://127.0.0.1:8011 \
  --chrome chromium/chrome-linux/headless_shell --password "$PW" --out /tmp/eui-e2e
bench --site ci-test.local execute erpnext_ui.tests.browser.records.teardown
bench --site ci-test.local execute erpnext_ui.tests.browser.support.teardown
```

`support.py` and `records.py` refuse to run on sites without `allow_tests`. With `bench watch` running, restart the test server after an asset rebuild: the server caches the asset manifest for up to 10 minutes and would otherwise serve old bundle hashes.

## 12. Screenshots

In [`screenshots/phase-2/`](screenshots/phase-2/):

| # | Requested | File |
| --- | --- | --- |
| 1 | Home workspace | `01-home-workspace.png` |
| 2 | Sidebar expanded | `02-sidebar-expanded.png`; filter in use: `02b-sidebar-filter.png` |
| 3 | Sidebar collapsed | `03-sidebar-collapsed.png` |
| 4 | Navbar | `04-navbar-page-header.png` |
| 5 | Sales Invoice form | `05-sales-invoice-form.png` (new); submitted: `theme-1-classic-light.png` |
| 6 | Purchase Order form | `06-purchase-order-form.png` |
| 7 | Stock Entry form | `07-stock-entry-form.png` |
| 8 | Customer form | `08-customer-form.png` |
| 9 | Sales Invoice list | `09-sales-invoice-list.png`; empty state: `09b-list-empty-state.png` |
| 10 | Item list | `10-item-list.png` |
| 11 | Report page | `11-report-sales-register.png` |
| 12 | Dialog and dropdown | `12a-submit-confirmation-dialog.png`, `12-dropdown-menu.png` |
| 13 | Light theme | `13-light-theme.png` |
| 14 | Dark theme | `14-dark-theme-form.png`, `14b-dark-theme-list.png`, `14c-dark-theme-workspace.png` |
| – | All six themes | `theme-1-classic-light.png` … `theme-6-classic-dark.png` |
| – | Tablet / phone | `15-tablet-*.png`, `15-phone-*.png` |
| – | Restricted user | `16-restricted-user.png` |
| – | Before Phase 2 (same site, layout layer off) | `before-home-workspace.png`, `before-sales-invoice-list.png`, `before-sales-invoice-form.png` |

## 13. Functional regression

Run through the real UI as a user with sales, purchase, stock and accounts roles, on clearly marked records (`EUI Test Customer A/B`, `EUI Test Supplier`, `EUI-TEST-WIDGET`, `EUI-TEST-SERVICE`, from `records.py`):

| Workflow | Result |
| --- | --- |
| Sales Invoice created and saved | ✅ Customer chosen by typing into the Link field and pressing Enter on a search result. A row added with **Add row** and deleted with the row checkbox and **Delete**. Item set, so `item_name` and `rate` were fetched. Saved with the page's primary button. |
| Sales Invoice submitted | ✅ through the native "Permanently Submit?" dialog; status pill shown |
| Purchase Order created and saved | ✅ |
| Stock Entry (Material Receipt) created and saved | ✅ (the test first used a wrong warehouse abbreviation; ERPNext rejected it with `LinkValidationError`, which shows that link validation works) |
| Customer and Supplier records open | ✅ |
| Link field search | ✅ |
| Filters, sorting, paging | ✅ filter by customer narrows the list; cleared; sort order toggled; paging buttons present |
| Reports execute | ✅ Sales Register, General Ledger, Stock Balance |
| Document actions | ✅ Create, the "…" menu (Toggle Sidebar, Email), print icon visible; submit (above) |
| Child tables | ✅ add, delete, edit, fetch |
| Workspaces load | ✅ Home, Selling, Buying, Stock, Invoicing |
| Custom fields | ✅ every custom field of Sales Invoice on this site has a rendered control |
| Native permissions | ✅ section 15 |

Upgrade path found and fixed during testing: a Single loads an unset Check field as 0, so `after_migrate`'s "fill missing defaults" stored **Enhanced Desk Layout = 0** on the Phase 1 site. Patch `v0_2.enable_desk_layout` runs before `after_migrate` and stores the default only where no value exists. This was replayed on `ci-test.local` and is covered by three tests.

## 14. Coexistence

- Backend suites on the same site: proposals 17 OK; business_health_checkup 128 + 59 OK; ai_erpnext 694 OK (run with outbound network blocked).
- Browser: Proposal, BHC Assessment and BHC Business list views load without errors in the Phase 2 Desk, and the ai_erpnext chat launcher is present.
- HRMS 17.0.0-dev is installed on the site. Its pages were not checked specifically, and there is no HRMS-specific integration.

## 15. Security

The layout layer reads nothing and writes nothing on the server beyond the two settings fields, which already require write permission on UI Experience Settings (System Manager). As a user with only *Report Manager*:

- `frappe.model.can_read('Sales Invoice')` is false.
- `frappe.client.get_list('Sales Invoice')` raises `PermissionError`.
- `query_report.run('Sales Register')` raises "You don't have access to Report".
- No Sales Invoice item appears in the sidebar, and the list shows no rows.
- The boot payload's `layout` contains only `enabled` and `width`.

The sidebar filter only hides items Frappe has already rendered for the user; it cannot reveal anything. Role and workspace visibility, User Permissions, document permissions and report permissions remain Frappe's. No endpoint was added.

## 16. Performance

- **Start-up:** no extra request (the layout flags come with the existing boot payload).
- **JavaScript:** one `sidebar_setup` handler, one passive delegated `mouseover` listener, one `input` and one `keydown` listener on the filter box. There is no DOM scanning on route change; the filter refresh counts sidebar items only when Frappe rebuilds the sidebar.
- **Listeners and duplicates:** the adapter's `install()` is guarded. The browser suite confirms one filter box and one token style element after 14 route changes, with no errors. The helper's `uninstall()` removes its listeners and the filter box; it is not called in normal use and is not covered by a test.
- **CSS:** no layout animations (short colour and shadow transitions only). Selectors stay close to native specificity, (0,2,1) plus the native chain. `!important` appears three times: twice to override a native `!important` (datatable cell colour, button focus ring) and once to show a collapsed section while the filter matches inside it (Frappe's `.hidden` is `display:none !important`).
- **Flicker:** the attributes are set before Desk renders (Phase 1 timing), so there is no visible switch from native to the new layout.

## 17. Known limitations

- **Frappe v16 only.** Other versions get neither theme nor layout until an adapter exists (Phase 4).
- **No structural form changes.** Fields, sections and tabs stay where the DocType defines them. Reordering or regrouping fields would need per-DocType metadata changes, which belongs to the Phase 3 customisation engine.
- **No global top bar.** v16 has none, and creating one would mean moving native elements (search, notifications, user menu) out of the sidebar. The page header serves as the top bar.
- **Not restyled:**
  - the workspace editor (edit mode), form builder, Customize Form and print preview
  - the POS page
  - Kanban, Calendar, Gantt and Image views (beyond shared components)
  - Frappe Charts series colours and the Quill toolbar in dark themes
  - website/portal pages, and the login page (Phase 3)
- **Splash screen** is unchanged from Phase 1 (drawn before scripts run).
- **Native quirks observed (not caused by this app):**
  - a `?customer=<unknown>` route option on a list leaves a stale filter while showing all rows
  - a user with no workspace access sees Frappe's "Not permitted … Page" dialog on `/app`
  - the Selling workspace number card queries Purchase Order and shows a permission error for users without purchase roles
- **Test environment:** the private test server ran without socket.io (realtime), so realtime UI updates were not exercised. Testing covered Chromium only, not Firefox or Safari.
- **Disposable records remain on `ci-test.local`** for repeat runs. `records.teardown` removes them, including documents the browser run created.

## 18. Reserved for Phase 3

Advanced visual customisation builder, drag-and-drop layout and dashboard builders, advanced workspace builder, login page customisation, white-label builder, role-based customisation, import/export studio. Phase 2 stays compatible with them: layout options travel in the boot payload under `layout`, every visual value is a token, and the engine owns the layout attributes.

## 19. Ready for approval?

**Yes, for review on `ci-test.local`.** All acceptance criteria are met within the limitations above:

- Phase 1 tests still pass.
- Browser tests pass, and screenshots were captured.
- No Frappe or ERPNext core file was modified.

Pending your decisions:

1. Commit the work. Phase 1 and Phase 2 are both still uncommitted.
2. Whether to install on `ai-erpnext.local`. It needs `bench --site ai-erpnext.local install-app erpnext_ui`, not run.
3. Whether to keep the disposable test records on `ci-test.local`.
