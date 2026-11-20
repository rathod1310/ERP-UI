# Phase 3 · M3 Report: Experience Packs, Homes and Selection

Milestone M3 of the approved [ERPNext Experience Packs](https://claude.ai/artifact/GcyAjWRQyAQ9CBSJmoJD2u) proposal. One choice, an **Experience Pack**, now sets the theme, layout values, density, font, shell component variants and the home page together. M4 (shell: navigation, headers, launcher, form/list/report presentations), M5 (branding and login), M6 (Studio) and M7 (release) follow.

## Status

**Implemented and verified on `ci-test.local` (Frappe 16.34.0 / ERPNext 16.35.0).** Not installed on or migrated to `ai-erpnext.local`; nothing committed.

| Suite | Result |
| --- | --- |
| Backend (`run-tests --app erpnext_ui`) | 123 integration + 41 unit, OK |
| Frontend unit (`node --test tests/js/*.test.mjs`) | 102/102 |
| Browser, M3 (`tests/browser/experiences.mjs`) | 26/26 |
| Browser regression: Phase 1 / Phase 2 / M1 / M2 | RESULT_REGRESSION |

## Decisions applied

All eight recommendations (D1–D8) were approved. One was changed during implementation:

- **D5 (home pages).** The proposal kept Frappe's own home for Classic Business and Minimal Professional. On v16 that native home is the **Desktop app grid**, the same for every user, so those two packs had identical homes (the screenshot check measured 2.3 % mean difference). Both now have their own designs on the `ui-home` page, built from **Frappe's own Home workspace content** (its shortcuts and link groups, permission-filtered by `frappe.desk.desktop.get_desktop_page`), as in the approved mockups. Frappe's workspace pages keep their per-pack treatment (banded link cards for Classic, hairlines for Minimal). If you prefer the native Desktop for these two packs, that is a one-line change in `experience/packs.py` (`CUSTOM_HOMES`).
- **D4 (fonts).** Self-hosting is approved but not yet done; packs still use Inter, System UI or Humanist Sans. Scheduled for M4 with the shell work.

## What was built

### Architecture

| Layer | Files |
| --- | --- |
| Pack registry and resolution (pure Python) | `experience/packs.py` (six packs, component variants, departments), `experience/resolve.py` (choose, apply adjustments, diff) |
| Records and data | `UI Experience` (pack records; standard packs synced from code, protected like standard themes), `UI Experience Allowed` (allowed list), `core/experience.py` (cached catalog), `core/home_data.py` (home data) |
| Settings | UI Experience Settings: **Default Experience**, **Allow Users to Choose Their Experience**, **Experiences Users May Choose**; default theme fields became fallback themes; layout preset and per-category defaults hidden (D3) |
| APIs | `save_preferences(experience, …adjustments)`, `restore_experience`, `reset_preferences`, `publish_defaults(experience, …)`, `api/home.get_home`, `get_cards`, `get_chart` |
| Boot | `extend_bootinfo` sets `bootinfo.home_page = "ui-home"` per user; the site default `desktop:home_page` is not touched |
| Browser | `experience/resolve.js`, `experience/engine.js` (`data-ui-x`, `data-ui-shell-<component>`, home route), customization session (experience + adjustments, previewed through the experience, theme and layout engines) |
| Pages | `ui-home` (six home designs, lazily loaded `erpnext_ui_home.bundle.js`), rebuilt Appearance & Theme page with `configuration/sketch.js` previews |

Packs only choose variants. CSS keys on component attributes (`html[data-ui-shell-home="hub"]` …), never on a pack name, so a custom pack made of existing variants needs no code (tested: `test_custom_pack_from_existing_variants`).

### The six homes

| Pack | Home | Data |
| --- | --- | --- |
| Classic Business | Structured workspace: shortcut row, banded "Reports & Masters" groups, all workspaces by area | Home workspace (Frappe), workspaces from boot |
| Modern Business | Dashboard: greeting, Number Cards, Sales trend chart, recently updated documents, assignments | Total Sales Amount, Sales Orders Count, Total Purchase Amount, Total Stock Value; chart Outgoing Bills |
| Application Hub | Launcher: search (opens Frappe's own search), quick actions, recent apps, category tiles; sidebar hidden on this page only (`page.hide_sidebar`, Frappe's own option) | Workspaces from boot (already permission-filtered) |
| Executive Suite | Executive overview: KPI band, sales and purchases chart, approvals, overdue receivables, activity | D8 Number Cards; Workflow Action; Sales Invoice (Overdue); Notification Log |
| Department Workspace | Department board: department tabs, pipeline strip, Assigned / Drafts / Approvals columns, reports | Departments the user can read, ordered by role; list counts with fixed filters |
| Minimal Professional | Search line, Pinned and Recent as plain lists, workspaces as text links | Home workspace, recently updated documents |

**Permissions.** Figures come from `frappe.get_list` and the Number Card / Dashboard Chart permission hooks. Frappe's `dashboard_chart.get` does not check the chart's permission itself, so `api/home.get_chart` does. Number Cards are filtered on the server (`get_cards`), and the browser computes them as Frappe's workspace widget does (dynamic filters, `get_result`). A user who can read none of them sees an explanation, not zeros. Results are cached per user for 60 seconds.

### Selection flow

Appearance & Theme opens on a gallery of the six packs, each with a structural preview drawn in its real theme colours. A pack's detail panel shows Home, Sales Invoice, List and Report previews and offers **Preview on my Desk** (whole Desk, this tab, nothing saved, preview bar), **Apply to Me**, **Set as Site Default** (settings writers) and **Restore Experience Defaults**. The earlier controls (themes, density, font, layout categories) are under a closed **Advanced** section and are stored as adjustments to the selected pack.

### Migration (patch `v0_5.experience_packs`)

- Stores "Allow Users to Choose Their Experience" = on where never stored.
- Syncs the themes and packs, then sets the site default from the retired layout preset (Classic / Modern → Classic Business, Compact → Minimal, Wide → Department).
- Every user keeps their saved theme, density, font and per-category layout as adjustments to the site default pack (D2). Layout preset choices are not carried over (D3). The original values stay under `_legacy`. Idempotent.

## Verification

The browser suite drives the real Desk as a System Manager and as a Report Manager-only user:

- each pack's home has its own structure (DOM markers, not only attributes);
- Sales Invoice, Purchase Order, Stock Entry, the Customer list and Sales Register open under every pack;
- dark variants, phone (390 px) and tablet (820 px) render without horizontal scrolling;
- preview does not save, and a full reload drops it;
- Apply switches the home without a reload; the choice survives reload and login;
- restore removes one pack's adjustments; the site default reaches users without a choice;
- a normal user cannot set it;
- a restricted user sees no figures or departments they cannot read;
- no JavaScript errors.

**Screenshot difference.** Every pair of the six homes is compared. The gate is the share of a 24 × 16 grid of screen regions whose colour differs (≥ 30 %); the mean pixel difference is reported too. Mostly-white pages keep the mean low even when their structure is completely different, which is why it is not the gate. Frappe's "Getting Started" onboarding panel, identical on every page, is put away before home screenshots. RESULT_DIFFERENCES

Screenshots: `docs/screenshots/phase-3-m3/` (`<pack>-1-home`, `-2-sales-invoice`, `-3-purchase-order`, `-4-stock-entry`, `-5-customer-list`, `-6-sales-register`, `-7-home-dark`, `-9-home-phone/tablet`, plus the gallery, detail previews, preview, search and restricted-user views).

## Activation bug: "Applied, but the Desk does not change" (reported 2026-11-03)

**Reproduced.** On `ci-test.local` (Administrator flow: Appearance → Modern Business → Apply to Me → `/desk`):
- `/desk` did show the Modern Business home (page `ui-home`, design `dashboard`, no console errors).
- Frappe's own launcher route `/desk/desktop` still showed the old app grid under every experience. When the launcher page's code was loaded for the first time, it also replaced the experience home *after* the home had been shown. With Classic, Hub and Minimal the new regression test caught the old launcher on screen.
- The reported screenshot came from port **8001**. That server is `frappe serve --port 8001` without `--site`, so it serves the default site, **`ai-erpnext.local`**. That site shares the app code but has not been migrated since M3: no UI Experience records, no `ui-home` page. Apply to Me still stored the choice there and showed "Modern Business is now your experience", while the Desk could not change.

**Root causes.**
1. *False success*: the Appearance page confirmed a choice the site could not show, and the API accepted it.
2. *Launcher route not owned*: only the empty route (`/desk`) used the experience home; `/desk/desktop` (Frappe's Desktop page, the native home on v16) did not.
3. *Race*: a redirect on the router's change event could be overtaken by Frappe's asynchronous page load.

**Fixes.**
- `api/preferences.save_preferences` and `api/settings.publish_defaults` refuse an experience change on a site that cannot render it (`core.experience.home_page_ready()`: the `ui-home` Page and the UI Experience DocType exist), with the message "This site has not been updated for Experience Packs yet…". The Appearance page shows the same notice there and disables Preview, Apply and Set as Site Default.
- The success message is shown only after checking what the user will see: the server's saved key, the engine's `data-ui-x` / `data-ui-shell-home`, and `frappe.boot.home_page`. Otherwise an "Experience Not Applied" message says why. The preview bar's Apply has no success message on failure either.
- While an experience home is active, Frappe's launcher page leads to it. The v16 adapter listens to Frappe's `page-change` event (fired by the page container after a page is really shown) and redirects with `frappe.route_flags.replace_route`, Frappe's own way to replace the history entry. Back therefore does not return to the launcher (checked: list → launcher → home → Back → list).
- One source of truth: the gallery sketches, the real home, the shell attributes and the theme all come from the same `experience.available[]` entries in the boot payload, resolved by `core/config.build_experience` from the UI Experience records. The test asserts that the gallery preview's `data-home` equals the rendered home design.

**Regression test (per pack, through the real page).** Apply from the Appearance page, then:
- `/desk` full load: the experience home, not the launcher;
- `/desk/desktop`: same home;
- open a workspace, Sales Invoice, a list and a report: experience still active on each;
- back home through Frappe's "Desktop" menu action;
- browser refresh: same home, same theme.

All six packs pass. Screenshots: `docs/screenshots/phase-3-m3/<pack>-0-real-desk.png`.

**`ai-erpnext.local`** keeps Frappe's own home and now explains why on the Appearance page. It shows the experiences after `bench --site ai-erpnext.local migrate`, which has not been run (needs your approval).

## Issues found and fixed during M3

- **Unmigrated sites.** The app code is shared by the bench. `ai-erpnext.local` (not migrated) sent users to the `ui-home` page it does not have ("Page ui-home not found"). The experience home is now used only when the site has the page (`core.experience.home_page_ready`, payload `home_available`). Covered by backend and JS tests.
- `frappe.utils.shorten_number(0)` returns an empty string: zero-valued cards showed "₹ NaN" or nothing.
- Frappe's sidebar re-shows itself inline on every page change; the Hub uses Frappe's `page.hide_sidebar` instead of CSS.
- The Phase 2 page card wrapped every home in one white panel, flattening the designs.

## Known limitations

- **Shell components are only attributes in M3.** Navigation, header, launcher, form, list and report variants are set on `<html>` but drawn in M4. Forms, lists and reports therefore still differ only by theme and layout values.
- Number Cards of type Report or Custom, and Dashboard Charts of type Report, Heatmap or with dynamic filters, are not shown on home pages yet.
- "Recently updated by you" reads the common transactions modified by the user; Frappe v16 keeps no Route History on this site.
- The Department board's counts use fixed filters per department (`experience/packs.py`); editing them is planned for the M6 Studio.
- The Hub remembers recent apps in the browser (localStorage), per user.

## Next

M4: draw the shell components: navigation variants, headers (reusing Frappe's search, notifications and user menu), launcher, form/list/report presentations, self-hosted fonts (D4).
