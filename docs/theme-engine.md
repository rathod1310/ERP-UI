# Theme Engine

## Loading

1. **Server.** `extend_bootinfo` embeds the effective configuration as `frappe.boot.erpnext_ui`:
   - enabled flag and adapter key;
   - appearance and its source;
   - selected light and dark theme names;
   - density and font;
   - site defaults;
   - `token_names`, the tokens every complete theme must have;
   - `catalog`: every enabled theme with its fully resolved tokens (about 6 KB for six themes).
2. **Browser.** `bootstrap()` runs before Desk renders. The engine:
   - resolves the mode: Light, Dark, or Automatic via `prefers-color-scheme`;
   - picks the theme for that mode;
   - writes one CSS rule `html[data-ui-theme="<key>"] { --ui-…: …; }` into `<style id="erpnext-ui-theme-tokens">`;
   - sets the `data-ui-theme`, `data-ui-mode`, `data-ui-density` and `data-ui-font` attributes, Frappe's `data-theme` and `data-theme-mode`, and finally `data-ui-adapter`.

Only the active theme's tokens are in the page. Switching rewrites the same element.

### Avoiding a flash of the wrong theme

- Frappe renders `data-theme` on the server from `User.desk_theme`. We mirror every appearance choice there, so light or dark is right on the first byte.
- The theme is applied before Desk's first render: the bundle runs synchronously, the boot data is inline, and no request is needed.
- What remains: Frappe's splash screen (drawn before any script) uses the native light/dark colours. If a user has never chosen an appearance and the site default is Dark, the splash is light for that load. `desk_theme` is "Light" for such users, and Frappe reads it before any hook can change it.

## Switching

`erpnext_ui.preferences.save({...})` calls `save_preferences`. The response is the new effective configuration, and `engine.update(config)` applies it without a reload.

Frappe's own **Toggle Theme** dialog (Ctrl+Shift+G) still works. It changes `data-theme-mode`; the engine's `MutationObserver` sees the change, shows the matching light or dark theme, and records the choice through `save_preferences`. Both controls therefore always agree.

In Automatic mode a `matchMedia("(prefers-color-scheme: dark)")` listener re-applies when the operating system switches.

## Persistence

| Choice | Stored in |
| --- | --- |
| light theme, dark theme, density, font | `__UserSettings` (key `UI Experience Settings`), written to Redis and the table immediately |
| appearance | same store (explicit choice) and `User.desk_theme` |

Choices survive refresh, logout/login and browser restarts because they live on the server, not in browser storage. Each user's choices are separate.

## Preview

`engine.preview(overrides)` applies an unsaved selection (`appearance`, `light_theme`, `dark_theme`, `density`, `font`, optional `force_mode`, optional `catalog`, optional `route`):

- `data-ui-preview="1"` marks the page;
- the saved configuration (`engine.config`) is untouched;
- `force_mode` shows a light theme while the user is in dark mode, or the reverse, without changing `data-theme-mode`;
- `catalog` previews themes the server resolved with an unsaved accent (`preview_catalog`, which stores nothing);
- `route` scopes the preview: the adapter calls `engine.onRouteChange` on every navigation, and leaving the route ends the preview;
- `endPreview()` and `update()` also end it.

The three levels:

| Action | Where | Effect |
| --- | --- | --- |
| Preview | Appearance & Theme page, UI Experience Settings, UI Theme | This tab only, until you leave the page |
| Save for Me | Appearance & Theme page | The current user, every device |
| Set as Site Default / Save settings | Page menu (settings writers) / UI Experience Settings | Everyone without a personal choice |

## Fallback behaviour

| Situation | Result |
| --- | --- |
| Selected theme deleted, disabled or of the wrong mode | Site default for that mode, then Classic Light / Classic Dark, then any complete theme of that mode |
| Theme missing tokens or containing unsafe values | Treated as unusable; next fallback |
| No usable theme for the mode | Engine deactivates; native Desk |
| `frappe.boot.erpnext_ui` missing or malformed | Engine inactive; native Desk |
| Server failed to build the payload | `{enabled: 0, error: 1}`; native Desk; logged server-side |
| Unknown Frappe version / feature detection fails | No adapter; engine inactive; native Desk |
| Exception anywhere during start-up | Everything the engine added is removed; native Desk |
| Settings disabled | Inactive; native Desk |
| Invalid stored settings values | Replaced by defaults when read |
| Tampered `__UserSettings` | Unknown keys and invalid values ignored |
| No `matchMedia` / `MutationObserver` | Automatic behaves as Light; Frappe-dialog sync not available |

Classic Light and Classic Dark cannot be disabled or deleted, so the fallbacks always exist.

## Safety of injected CSS

Token values reach a `<style>` element, so they are validated twice:

- on the server, colours must be `#rrggbb` and shadows are generated from fixed styles;
- in the browser, `tokens.js` accepts only `[#a-zA-Z0-9(),.%\s-]`: no quotes, semicolons, braces, colons, slashes or angle brackets. Theme keys must match `[a-z0-9-]`.

## Events

Dispatched on `document`: `erpnext-ui:applied` (detail: the current theme, mode, density and font), `erpnext-ui:preview`, `erpnext-ui:deactivated`. Phase 2 components can listen to these instead of polling.

## Debugging

Tick **Log Theme Engine Diagnostics in the Browser Console** in UI Experience Settings. `window.erpnext_ui.engine` exposes `active`, `reason`, `current`, `config` and `applyCount`.
