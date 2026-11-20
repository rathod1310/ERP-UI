# Phase 1 Report: Foundation, Design System and Theme Engine

Date: 2026-11-02 · App version 0.1.0 · Branch `version-16`

## Status

**Phase 1 is complete for Frappe 16.34.0 / ERPNext 16.35.0**, with the limitations listed below. All automated suites pass: 76 backend, 44 frontend unit, 21 browser end-to-end.

The app is installed only on the test site `ci-test.local`. It is **not** installed on the working site `ai-erpnext.local`; that needs the owner's approval (see "Install commands").

## Environment found

| Item | Found |
| --- | --- |
| Bench | `/home/erpuser/frappe-bench` (not a git repository) |
| Frappe | 16.34.0 (`version-16`); the brief expected 16.16.0 |
| ERPNext | 16.35.0 (`version-16`); the brief expected 16.15.1 |
| HRMS | 17.0.0-dev (`develop`); the brief expected 16.5.1 |
| Other apps | ai_erpnext, business_health_checkup, estate_notice, proposals |
| Sites | `ai-erpnext.local` (default, working data), `ci-test.local` (test site, `allow_tests`, MariaDB in Docker on port 3317) |
| Conventions followed | `version-16` branch, publisher Skydot Infotech, ruff config as in business_health_checkup, per-test savepoints in tests |

## Reference project research (its-alikhokher/swift_theme)

The repository was cloned and its source read: `hooks.py`, `api/boot.py`, `install.py`, `swift-boot.js`, `swift-mode-observer.js`, and the CSS layout.

Reusable ideas (re-implemented, not copied):

- Embed the effective preferences in boot (`extend_bootinfo`) so the first paint needs no request.
- Layer on top of Frappe's `data-theme` instead of replacing it, and observe `data-theme-mode` to stay in sync with the native switcher.
- Resolve "user override, then site default" on the server.

Outdated or risky, so done differently here:

| Swift Theme | Risk | ERPNext UI |
| --- | --- | --- |
| Nine Custom Fields on **User** for preferences (adds columns to a core table) | Schema change on a core DocType; fixtures to keep in sync | Frappe's `__UserSettings` store plus the existing `desk_theme` field; no core schema change |
| Monkey-patches `jQuery.parseHTML` to fix `src="undefined"` | Changes behaviour for every app | No patches of Frappe or jQuery functions |
| Guest-accessible preference endpoint | Exposure surface | All endpoints require login; admin endpoints check DocType permission |
| Per-preset hand-written stylesheets, plus a separate role map in JS | Two sources of truth that can drift | One Python registry; the browser receives resolved tokens |
| localStorage cache of preferences | A previous user's theme on a shared browser; stale values | Server is the only store; nothing kept in the browser |
| Brand-logo replacement, sounds, org chart, calendar, command palette | Scope creep, more to break | Out of scope; Phase 1 is the token and theme foundation |
| Character-named, high-contrast presets and backdrops | Not professional enough for this brief | Six restrained presets with contrast rules enforced by tests |

## Implemented features

- Standalone app `erpnext_ui` (module "ERPNext UI") with modular Python (`theme/`, `core/`, `api/`) and JavaScript (`core/`, `theme/`, `adapters/`, `preferences/`, `configuration/`) layers.
- Hooks: `app_include_css`, `app_include_js`, `extend_bootinfo`, `after_install`, `after_migrate`, `after_uninstall`. No overrides of Frappe methods or DocTypes.
- Token registry: 23 per-theme colours plus radius, shadows, heading weight and colour scheme; static typography, layout, component and density tokens in CSS; derived states via `color-mix`.
- Six presets: Classic Light, Professional Blue, Neutral Grey, Soft Green, Professional Dark, Classic Dark.
- Light, Dark and Automatic appearance, kept in sync with Frappe's native Toggle Theme.
- Live switching without reload; persistence across refresh, logout/login and browsers.
- User preferences: light theme, dark theme, appearance, density, font.
- Administrator settings: enable/disable, allow user selection, default appearance, themes, density, font, accent override, debug logging; Preview; Reset to Defaults; status panel with versions and adapter.
- Custom themes: "Create Custom Theme" from a preset, **Based On** inheritance, colour and contrast validation, protection of standard presets.
- Preview at three levels: this tab only, save for me, publish as site default. Previews are route-scoped and end on navigation.
- Safe fallbacks for invalid configuration, unsupported versions and start-up errors.
- Version adapter foundation (v16) with feature detection.

## DocTypes and pages

| Name | Type | Purpose |
| --- | --- | --- |
| UI Experience Settings | Single | Global configuration |
| UI Theme | DocType (System Manager) | Named theme definitions; six standard presets synced from code |
| ui-preferences ("Appearance & Theme") | Page (Desk User) | Each user's own preferences, preview, save, reset |

No DocType was created for user preferences; `__UserSettings` and `User.desk_theme` are used instead.

## APIs

`erpnext_ui.api.theme.get_config`, `get_catalog`, `preview_catalog` · `erpnext_ui.api.preferences.get_preferences`, `save_preferences`, `reset_preferences` · `erpnext_ui.api.settings.publish_defaults`, `reset_settings`, `get_status`. Details are in [architecture.md](architecture.md#backend-apis).

## Frontend modules

`core/bootstrap.js` (single guarded entry), `core/logger.js`, `theme/tokens.js` (validation, CSS generation), `theme/resolve.js` (pure resolution), `theme/engine.js` (DOM application, observers, preview), `adapters/index.js` + `adapters/v16.js`, `preferences/client.js`, `configuration/gallery.js`. Bundle sizes: CSS 12.7 KB, JS 15 KB (production build).

## Tests executed

All on `ci-test.local` (Frappe 16.34.0, ERPNext 16.35.0, HRMS 17.0.0-dev, plus ai_erpnext, proposals, business_health_checkup).

| Suite | Command | Result |
| --- | --- | --- |
| Backend integration | `bench --site ci-test.local run-tests --app erpnext_ui` | **61/61 OK** |
| Backend unit (presets, contrast, resolver) | same run | **15/15 OK** |
| Frontend unit (`node:test`, no dependencies) | `node --test erpnext_ui/tests/js/*.test.mjs` | **44/44 OK** |
| Browser end-to-end (headless Chromium over CDP) | `node erpnext_ui/tests/browser/e2e.mjs …` | **21/21 OK** |
| Coexistence | `bench --site ci-test.local run-tests --app proposals` | **17/17 OK** |
| Fresh install | uninstall, then `install-app` | OK (after fixing the bug below) |
| App-only migrate, twice | `sync_for` + `after_migrate` | OK, idempotent |
| Lint | `ruff check`, `ruff format --check`, prettier, `node --check` | Clean |
| Leftover data after tests | queries for test users, `__UserSettings`, custom themes | None |

Backend coverage: settings creation and defaults; invalid stored values falling back; valid and invalid settings updates; theme retrieval and catalog cache invalidation; standard-preset protection; custom-theme validation (hex, contrast, mode, radius); preference retrieval, updates, merging and durability after cache loss; invalid values rejected; user isolation; no `user` parameter; preferences grant no permissions; tampered `__UserSettings` ignored; the allow-user-selection policy; disabled app; administrator-only endpoints (publish, reset, status, accent preview) refused to regular users; boot payload shape; boot never raising; adapter selection by version; the appearance rules (Frappe's default "Light" is not a choice, an earlier native Dark is respected, an explicit Light beats a Dark default).

Frontend unit coverage: token and CSS-injection safety; mode resolution; payload normalisation; theme fallbacks; initialisation; duplicate-init prevention; CSS variable output; light, dark and automatic modes including OS changes; switching without reload; sync with Frappe's dialog (no observer loop); preview and end of preview; forced-mode preview; route navigation; missing configuration; unsupported version; no usable theme; disable and re-enable without duplicate listeners; destroy; old browsers without `matchMedia` or `MutationObserver`; bootstrap guards; adapter selection; gallery HTML escaping.

Browser checks (real Desk, real server): Classic Light initialises; primary buttons use theme colours; switching without reload; persistence after refresh; route navigation; dark mode, including after reload; Classic Dark; Automatic following emulated OS changes; Frappe's Toggle Theme stays in sync and is persisted; density and font; the preferences-page preview does not save and ends on navigation; dark-theme preview in light mode, then save; invalid stored theme falls back; duplicate bundle load ignored; user isolation across logout/login; user-menu entry present; native ERPNext pages without JavaScript errors; settings form gallery, preview (not saved) and status; HTTP 403 for a regular user calling `publish_defaults`; disabling restores native Desk; no JavaScript errors during the run.

The browser run ignores one class of console error: "Error connecting to socket.io". The temporary test server ran without the realtime service.

### Browser validation (how to repeat)

```bash
bench --site ci-test.local serve --port 8011            # separate terminal
PW=<random password>
bench --site ci-test.local execute erpnext_ui.tests.browser.support.setup --args "['$PW']"
node apps/erpnext_ui/erpnext_ui/tests/browser/e2e.mjs --base http://127.0.0.1:8011 \
  --chrome chromium/chrome-linux/headless_shell --password "$PW" --out /tmp/eui-e2e
bench --site ci-test.local execute erpnext_ui.tests.browser.support.teardown
```

`support.py` refuses to run on sites without `allow_tests`.

## Problems found and fixed during verification

1. **Install failed on a fresh site.** Frappe's `init_singles()` saves new Singles before `after_install`, and the Link defaults (`Classic Light` / `Classic Dark`) failed link validation because the themes did not exist yet. The JSON defaults were removed; `ensure_settings()` fills them after the presets are synced.
2. **The site default appearance never applied to new users.** Frappe gives new users `desk_theme = "Light"`, which cannot be told apart from a real choice. The explicit choice is now recorded in `__UserSettings`, and the engine records choices made in Frappe's own dialog.
3. **Patchy list views.** v16 assumes `--bg-color` equals `--fg-color`. Mapping the tinted background token onto `--bg-color` left white filter bars over tinted list bodies. `--bg-color` now maps to the surface; the background token waits for the Phase 2 layout.
4. **Plain-CSS `@import` broke Frappe's PostCSS build.** Switched to an SCSS bundle.
5. **Preferences page had no horizontal padding.** Added.

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| Custom Frappe app installs successfully | ✅ fresh install on ci-test.local |
| Application structure is modular | ✅ |
| No Frappe/ERPNext core files modified | ✅ only `apps/erpnext_ui` and `sites/apps.txt` (added by `bench new-app`) changed |
| Design-token system works | ✅ unit and browser checks (computed `--primary`, button colours) |
| Six presets implemented | ✅ contrast rules enforced by tests |
| Light / Dark / Automatic modes work | ✅ browser |
| Theme switching works | ✅ browser, no reload |
| Theme selection persists | ✅ refresh, re-login |
| User preferences work | ✅ |
| Administrator settings work | ✅ API tests; browser: form, gallery, preview, status. The **Reset to Defaults** button itself was not clicked in the browser (its API is tested) |
| Theme preview works | ✅ preferences page and settings form in the browser. The UI Theme form's Preview button and accent-colour preview were not exercised in the browser (the `preview_catalog` API is tested) |
| Invalid configuration falls back safely | ✅ |
| Frontend initialisation is reliable | ✅ duplicate load, broken payload, exceptions |
| Backend permission tests pass | ✅ |
| Frontend tests pass | ✅ 44 unit + 21 browser |
| Existing ERPNext functionality remains intact | ✅ for the pages checked, plus the proposals suite. Not a full regression of ERPNext |
| Assets build successfully | ✅ `bench build --app erpnext_ui` |
| Documentation complete | ✅ |
| Phase 1 report produced | ✅ this file |

## Files

Created (all under `apps/erpnext_ui`, scaffolded with `bench new-app`):

- Python: `boot.py`, `install.py`, `theme/{tokens,presets,resolver,colour}.py`, `core/{compat,config,preferences,settings,themes}.py`, `api/{theme,preferences,settings}.py`
- DocTypes: `erpnext_ui/doctype/ui_experience_settings/*`, `erpnext_ui/doctype/ui_theme/*`; page `erpnext_ui/page/ui_preferences/*`
- CSS: `public/css/erpnext_ui.bundle.scss`, `tokens/{typography,layout,components,density,colors}.scss`, `adapters/v16.scss`, `components/preferences.scss`
- JS: `public/js/erpnext_ui.bundle.js`, `core/{bootstrap,logger}.js`, `theme/{tokens,resolve,engine}.js`, `adapters/{index,v16}.js`, `preferences/client.js`, `configuration/gallery.js`
- Tests: `tests/{fixtures,test_presets,test_themes,test_preferences,test_settings,test_config}.py`, `tests/js/{helpers,resolve.test,engine.test,integration.test}.mjs`, `tests/browser/{support.py,e2e.mjs}`
- Docs: `README.md`, `docs/{architecture,design-system,theme-engine,compatibility,phase-1-report}.md`

Modified scaffold files: `hooks.py`, `__init__.py` (version 0.1.0), `pyproject.toml` (Python ≥ 3.10, ruff target py310).

Outside the app: `sites/apps.txt` gained `erpnext_ui` (`bench new-app`); the app is installed in the bench virtualenv (editable).

## Known bugs and limitations

See [compatibility.md](compatibility.md#known-limitations). In short:

- The background token is not visible in v16 Desk.
- Indicator pills, charts, the dark-mode Quill toolbar, print, login and portal pages are not themed.
- Density affects only controls that read Frappe's height variables.
- Splash-screen colour for users without an appearance choice when the site default is Dark.
- Only Frappe v16 has an adapter, and only 16.34.0 was tested.
- Responsive and mobile layouts were not checked in the browser; testing used a 1366×900 window.
- The user-menu entry was verified in the menu data, not by opening the dropdown.

## Reserved for Phase 2

Sidebar, navbar and workspace redesign; form layouts and section styling; list view layout (row height, density in lists); report and datatable styling; dashboards and charts colours; indicator and status colour system; dialogs; the login page; making the background token visible through a card-on-background layout.

## Install commands

On a site where you want the app (the test site already has it):

```bash
cd ~/frappe-bench
bench build --app erpnext_ui
bench --site <site> install-app erpnext_ui
```

After pulling new versions:

```bash
bench build --app erpnext_ui
bench --site <site> migrate
```

For `ai-erpnext.local`, `install-app` installs only this app (DocType sync and the six presets). It does not run other apps' patches. If `bench start` is running, clear the cached asset manifest after a build: `redis-cli -p 13000 del assets_json`.

## Ready for Phase 2?

**Yes.** Token categories, engine events, the adapter layer and the preview mechanism are in place for the layout work. Recommended first steps for Phase 2: decide whether the tinted-background layout is wanted (it changes the look of every page), then build the component partials against the existing static tokens.
