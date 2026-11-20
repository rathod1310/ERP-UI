# Architecture

## Overview

```
erpnext_ui/
├── hooks.py                 app_include_css/js, extend_bootinfo, install hooks
├── boot.py                  extend_bootinfo -> frappe.boot.erpnext_ui
├── install.py               after_install / after_migrate / after_uninstall
├── patches/v0_2/            enable_desk_layout (Phase 1 -> 2 upgrade)
├── patches/v0_3/            layout_presets (Phase 2 -> 3 upgrade)
├── theme/                   pure Python, no database
│   ├── tokens.py            token registry (names, categories, option sets)
│   ├── presets.py           the six standard presets
│   ├── layouts.py           layout categories, the four layout presets, resolve() (Phase 3)
│   ├── resolver.py          validation, completion, accent, contrast rules
│   └── colour.py            hex parsing, WCAG contrast, mixing
├── core/                    services used by hooks and APIs
│   ├── settings.py          UI Experience Settings with safe defaults
│   ├── themes.py            UI Theme records -> resolved catalog (Redis cached)
│   ├── preferences.py       per-user storage (__UserSettings + User.desk_theme)
│   ├── config.py            builds the browser payload
│   └── compat.py            version detection, adapter selection
├── api/                     whitelisted endpoints (thin)
│   ├── theme.py             get_config, get_catalog, preview_catalog
│   ├── preferences.py       get/save/reset the current user's preferences
│   └── settings.py          publish_defaults, reset_settings, get_status
├── erpnext_ui/              module "ERPNext UI"
│   ├── doctype/ui_experience_settings/   Single: global configuration
│   ├── doctype/ui_theme/                 named theme definitions
│   └── page/ui_preferences/              "Appearance & Theme" page
├── public/
│   ├── css/erpnext_ui.bundle.scss        imports the partials below
│   │   ├── tokens/                       --ui-* declarations only
│   │   ├── adapters/v16.scss             maps tokens onto Frappe v16 variables
│   │   ├── adapters/v16/                 Desk layout layer (Phase 2), see desk-layout.md
│   │   └── components/preferences.scss   gallery, segmented control, banner
│   └── js/erpnext_ui.bundle.js           -> core/bootstrap.js
│       ├── core/          bootstrap (single entry), logger
│       ├── theme/         tokens.js, resolve.js (pure), engine.js (DOM)
│       ├── layout/        resolve.js (pure, mirrors theme/layouts.py), engine.js (Phase 3)
│       ├── customize/     session.js (draft, preview, save/cancel), preview-bar.js
│       ├── adapters/      registry + v16 integration (v16/navigation.js: sidebar filter)
│       ├── preferences/   PreferencesClient (server calls)
│       └── configuration/ gallery and segmented-control renderers
└── tests/                 Python tests, js/ (node:test), browser/ (CDP)
```

Layering rules:

- `theme/` has no Frappe imports, so it can be unit-tested and reused by future tools such as the Phase 3 studio.
- `core/` is the only layer that reads or writes the database.
- `api/` validates input and checks permissions, then delegates to `core/`.
- In the browser, `theme/resolve.js` and `theme/tokens.js` are pure. `theme/engine.js` touches the DOM only through objects passed to it. Version-specific Desk code lives only in `adapters/`.

## Frontend initialisation

1. `desk.html` renders `<html data-theme="…">` from `User.desk_theme` (native Frappe), loads `app_include_css` in `<head>`, writes `frappe.boot = {…}` inline, then loads `app_include_js`.
2. `erpnext_ui.bundle.js` runs synchronously after Frappe's desk bundle and before Desk renders on document ready. `bootstrap(window)`:
   - returns the existing engine if one exists (duplicate-load guard);
   - normalises `frappe.boot.erpnext_ui` (`resolve.normaliseConfig`);
   - selects an adapter: the server names one for the running Frappe major version, and the adapter confirms with feature detection;
   - `engine.init(config, adapter)` writes one `<style id="erpnext-ui-theme-tokens">` and the `data-ui-*` attributes, with `data-ui-adapter` last;
   - `adapter.install()` subscribes once to `frappe.router` changes, adds the user-menu entry to the in-memory Navbar Settings rows, and installs the sidebar navigation helper (one `sidebar_setup` handler, one delegated `mouseover` listener).
   - All of this runs inside `try/catch`. On any error the engine removes everything it added and Desk stays native.
3. The adapter CSS applies only under `html[data-ui-adapter="v16"]`, so CSS shipped without a working engine changes nothing. The Desk layout layer additionally needs `data-ui-layout="enhanced"`, which the engine sets from the settings (`layout.enabled`).

No request is made at start-up: everything comes from the boot payload.

## Theme and layout: two engines

Since Phase 3 the theme engine (`theme/engine.js`) owns only colours, mode, density and font, and the layout engine (`layout/engine.js`) owns the layout attributes (`data-ui-layout`, `-nav`, `-workspace`, `-form`, `-list`, `-width`, `-cards`, `-canvas`, `-layout-preview`). Either can change without the other, which is what lets any theme combine with any layout preset. The layout engine starts after the theme engine, only when it is active, and deactivates when the theme engine does.

`customize/session.js` holds one draft of both (what the Appearance & Theme page edits) and previews it through both engines. The preview is not tied to a route: it stays on every Desk page, with `customize/preview-bar.js` offering Save, Cancel Preview and Customize, until it is saved or cancelled. `PreferencesClient` hands every server response to both engines.

Layout resolution has one rule set, implemented twice: `theme/layouts.py` for the boot payload and APIs, and `layout/resolve.js` for previews. `tests/layout_cases.json` holds the registry and shared cases that both test suites check. Per category, the order is: the user's value (if the category is open to users), then the user's preset, then the site default for the category, then the site default preset.

## Backend APIs

| Method | HTTP | Who | Purpose |
| --- | --- | --- | --- |
| `erpnext_ui.api.theme.get_config` | GET | signed-in | Effective configuration (same shape as boot) |
| `erpnext_ui.api.theme.get_catalog` | GET | signed-in | Enabled themes with resolved tokens |
| `erpnext_ui.api.theme.preview_catalog` | POST | settings writers | Themes resolved with an unsaved accent; stores nothing |
| `erpnext_ui.api.preferences.get_preferences` | GET | signed-in | Effective configuration for the current user |
| `erpnext_ui.api.preferences.save_preferences` | POST | signed-in | Save the current user's theme/appearance/density/font and layout preset/formats ("" clears a layout choice; closed categories raise PermissionError) |
| `erpnext_ui.api.preferences.reset_preferences` | POST | signed-in | Forget the current user's choices |
| `erpnext_ui.api.settings.publish_defaults` | POST | settings writers | Make a selection (theme and layout) the site default |
| `erpnext_ui.api.settings.reset_settings` | POST | settings writers | Restore shipped defaults |
| `erpnext_ui.api.settings.get_status` | GET | settings writers | Versions, adapter, tested versions |

"Settings writers" means users with write permission on UI Experience Settings, which is System Manager by default; the check is `frappe.has_permission`. No endpoint accepts a user id. Preference endpoints always act on `frappe.session.user`. Every value is validated server-side: theme names against the enabled catalog and the right mode, and density, font and appearance against fixed lists.

## Data model

| Store | Holds | Why |
| --- | --- | --- |
| **UI Experience Settings** (Single) | enabled, allow_user_selection, default appearance/themes/density/font, accent, debug flag, desk_layout; default layout preset and per-category layout defaults (blank: from the preset); one "allow users" switch per layout category | One global record |
| **UI Theme** | name, mode (Light/Dark), based_on, 23 colour fields, corner radius, shadow style, heading weight, enabled, sort order, is_standard | Named, reusable definitions; standard presets are synced from code |
| `__UserSettings` (key `UI Experience Settings`) | light_theme, dark_theme, density, font, explicit appearance; layout_preset and per-category layout choices | Frappe's standard per-user store; no new DocType needed |
| `User.desk_theme` | Light / Dark / Automatic | Frappe's own field, written by the native Toggle Theme dialog; mirrored so the server renders `data-theme` correctly |

`desk_theme` cannot record "no choice": Frappe fills new users' Select field with "Light". The explicit choice is therefore also kept in `__UserSettings`. The appearance resolution order is:

1. an explicit choice recorded by this app;
2. otherwise a `desk_theme` of Dark or Automatic (chosen earlier in Frappe's dialog);
3. otherwise the site default.

`__UserSettings` can also be written through Frappe's generic `frappe.model.utils.user_settings.save` endpoint. Our reader sanitises every value on read, so injected keys or values are ignored.

Writes to `__UserSettings` go to Redis and to the table in the same request (Frappe's own path only syncs Redis to the table later), so a cache flush cannot lose a saved preference.

## Configuration flow

```
UI Theme rows ──► core.themes.build_catalog ──► Redis (erpnext_ui:catalog:<accent>)
                         ▲ cleared on UI Theme / Settings save
UI Experience Settings ──► core.settings.get_settings (cached doc, invalid values -> defaults)
__UserSettings + User.desk_theme ──► core.preferences
                         │
                         ▼
               core.config.build_config ──► boot (extend_bootinfo, every Desk load)
                                         └► API responses after save/reset/publish
                         │
                         ▼
     browser: normaliseConfig ─► ThemeEngine.update() ─► <style> + data-ui-* attributes
```

`extend_bootinfo` runs on every Desk load, outside Frappe's boot cache. It costs one cached-doc read, one Redis read for the catalog, and one Redis or database read for preferences. If it fails it returns `{enabled: 0, error: 1}` and logs to `frappe.logger("erpnext_ui")`, so Desk always loads.

## Install, migrate, uninstall

- `after_install` / `after_migrate`: `sync_standard_themes()` creates or updates the six presets. It overwrites their definitions but keeps an administrator's `enabled` and `sort_order`. `ensure_settings()` then fills unset settings without overwriting existing ones.
- The default-theme Link fields have no JSON default on purpose. Frappe's `init_singles()` saves new Singles before `after_install` runs, when the themes do not exist yet.
- Patch `v0_2.enable_desk_layout` (post-model-sync, runs before `after_migrate`): a Single loads an unset Check field as 0, so `ensure_settings()` cannot tell "never set" from "switched off". The patch stores `desk_layout = 1` and `content_width = Full Width` only where no value is stored yet.
- `after_uninstall`: removes this app's `__UserSettings` rows and Redis keys. `User.desk_theme` is left alone because it belongs to Frappe.

## Extension points for later phases

- **Phase 2 (done):** the layout layer lives in `css/adapters/v16/` and `js/adapters/v16/` because every selector in it depends on the v16 DOM. A future adapter adds its own folder. See [desk-layout.md](desk-layout.md).
- **Phase 3 (studio and personalisation):** `theme/resolver.py` already validates arbitrary definitions and computes contrast. UI Theme is the storage. `engine.preview({catalog})` can show unsaved definitions.
- **Phase 4 (compatibility):** add `ADAPTERS[15]` / `ADAPTERS[17]` in `core/compat.py` and a matching JS adapter, after testing on those versions.
