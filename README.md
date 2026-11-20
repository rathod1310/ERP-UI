## ERPNext UI

A design system and theme engine for Frappe/ERPNext Desk. ERPNext UI gives Desk a
consistent, professional look through design tokens: colours, typography, spacing,
shape, elevation and density. It does not add decorative effects.

Phase 1 delivered the foundation:

- a central design-token registry exposed as `--ui-*` CSS custom properties
- six restrained theme presets (four light, two dark)
- Light, Dark and Automatic (follows the operating system) appearance
- per-user preferences and site-wide administrator defaults
- live preview before saving, at user and site level
- a version adapter that maps the tokens onto native Frappe v16 Desk

Phase 2 adds the Desk layout layer on top of it: a page background with content
cards, a restyled sidebar with a menu filter, a consistent page header, and
cleaner workspaces, forms, child tables, list views, reports and shared
components, in all six themes and on tablet and phone widths. It changes
presentation only: no business logic, permission or workspace data is touched.
See [docs/phase-2-report.md](docs/phase-2-report.md).

### Supported versions

| Component | Tested             | Adapter           |
| --------- | ------------------ | ----------------- |
| Frappe    | 16.34.0            | `v16`             |
| ERPNext   | 16.35.0            | (uses Frappe's)   |
| HRMS      | 17.0.0-dev (present on the test site) | no specific integration |

Other Frappe major versions load the app, but the engine stays inactive and Desk
keeps its native look. See [docs/compatibility.md](docs/compatibility.md).

### Installation

```bash
cd ~/frappe-bench
bench get-app <repository-url> --branch version-16   # or keep apps/erpnext_ui
bench build --app erpnext_ui
bench --site <site> install-app erpnext_ui
```

Installing creates the six standard themes and the default settings. Existing users
see Classic Light until they choose otherwise.

To update an installed site:

```bash
bench build --app erpnext_ui
bench --site <site> migrate
```

`migrate` re-syncs the standard presets and fills any new settings with defaults. It
never overwrites an administrator's choices.

### Configuration (administrators)

Open **UI Experience Settings** (search for it in the awesome bar):

- **Enable UI Experience**: turn the whole engine on or off. When off, everyone
  sees the native interface.
- **Allow Users to Choose Their Own Theme**: when off, everyone uses the defaults.
  Light/Dark/Automatic stays each user's own choice, as it is in native ERPNext.
- **Default Appearance, Light Theme, Dark Theme, Density, Font**: the site defaults.
- **Accent Colour Override** (optional): replaces every theme's primary colour. It
  is adjusted automatically where needed to keep text readable.
- **Enhanced Desk Layout** (Phase 2): the page background, cards, sidebar, page
  headers, workspace, form, list and report presentation. When off, only the theme
  colours, density and font apply.
- **Default Layout Preset** (Classic, Modern, Compact, Wide) and optional
  defaults per layout category (navigation, workspace, forms, lists, content
  width, cards, page background); blank follows the preset.
- **User Layout Customization**: which layout categories users may change for
  themselves.
- **Preview** shows the unsaved settings in your own browser tab only. **Reset to
  Defaults** restores the shipped settings.

**UI Theme** lists the themes. The standard presets can be enabled, disabled or
reordered. To change colours, open a preset, choose **Create Custom Theme** and
edit the copy. Custom themes are checked for readable contrast when saved.

### Usage (everyone)

Open the user menu and choose **Appearance & Theme**, or go to `/app/ui-preferences`.
The page has eight sections: Themes, Layout Presets, Navigation, Workspace, Forms,
Lists and Tables, Typography and Density, Content and Cards. Any theme combines
with any layout. Each choice is previewed immediately and stays visible on every
page you open, with a bar at the bottom: **Save for Me** stores it, **Cancel
Preview** restores your current settings. **Reset to Default** returns to the site defaults. Settings managers
also get **Set as Site Default** in the page menu.

### Development

```bash
# backend tests (90 integration + 21 unit)
bench --site <test-site> run-tests --app erpnext_ui

# frontend unit tests (Node 18+, no dependencies)
node --test apps/erpnext_ui/erpnext_ui/tests/js/*.test.mjs

# browser checks: docs/phase-1-report.md (theme engine, e2e.mjs) and
# docs/phase-2-report.md (Desk layout and regression, phase2.mjs) and
# docs/phase-3-milestone-1-report.md (layout presets, phase3m1.mjs)
```

Documentation:

- [docs/architecture.md](docs/architecture.md): modules, initialisation, APIs, data model
- [docs/design-system.md](docs/design-system.md): tokens and theme standards
- [docs/theme-engine.md](docs/theme-engine.md): loading, switching, preview, fallback
- [docs/compatibility.md](docs/compatibility.md): versions, adapters, limitations
- [docs/desk-layout.md](docs/desk-layout.md): the Phase 2 layout layer, module by module
- [docs/phase-1-report.md](docs/phase-1-report.md): what Phase 1 delivered and how it was verified
- [docs/phase-2-report.md](docs/phase-2-report.md): what Phase 2 delivered and how it was verified
- [docs/phase-3-milestone-1-report.md](docs/phase-3-milestone-1-report.md): layout presets and customization

This app uses `pre-commit` (ruff, eslint, prettier, pyupgrade):
`cd apps/erpnext_ui && pre-commit install`.

### License

MIT
