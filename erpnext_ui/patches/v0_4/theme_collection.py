"""Phase 3 M2: the theme collection replaces the six Phase 1 presets.

1. Store defaults for the new backdrop settings where nothing is stored (a
   Single loads an unset Check field as 0).
2. Move site defaults and every user's saved light/dark theme from a Phase 1
   preset to its successor (presets.LEGACY_SUCCESSORS).
3. Disable the Phase 1 preset records. They are kept, so custom themes based
   on them keep working, and an administrator can enable them again.

Runs after the DocTypes are synced and before after_migrate, which creates the
new standard records; names are therefore written directly, without Link
validation.
"""

import json

import frappe

from erpnext_ui.core.preferences import USER_SETTINGS_KEY
from erpnext_ui.core.settings import DEFAULTS, SETTINGS_DOCTYPE
from erpnext_ui.theme.presets import LEGACY_SUCCESSORS

NEW_CHECKS = ("enable_backdrops", "backdrop_through_panels")
THEME_KEYS = ("light_theme", "dark_theme")


def _stored(field):
	rows = frappe.db.sql(
		"select value from `tabSingles` where doctype = %s and field = %s", (SETTINGS_DOCTYPE, field)
	)
	return rows[0][0] if rows else None


def execute():
	for field in NEW_CHECKS:
		if _stored(field) is None:
			frappe.db.set_single_value(SETTINGS_DOCTYPE, field, DEFAULTS[field])

	for field in ("default_light_theme", "default_dark_theme"):
		current = _stored(field)
		if current in LEGACY_SUCCESSORS:
			frappe.db.set_single_value(SETTINGS_DOCTYPE, field, LEGACY_SUCCESSORS[current])

	rows = frappe.db.sql(
		"select user, data from `__UserSettings` where doctype = %s", (USER_SETTINGS_KEY,), as_dict=True
	)
	for row in rows:
		try:
			data = json.loads(row.data or "{}")
		except ValueError:
			continue
		if not isinstance(data, dict):
			continue
		changed = False
		for key in THEME_KEYS:
			if data.get(key) in LEGACY_SUCCESSORS:
				data[key] = LEGACY_SUCCESSORS[data[key]]
				changed = True
		if changed:
			frappe.db.sql(
				"update `__UserSettings` set data = %s where user = %s and doctype = %s",
				(json.dumps(data), row.user, USER_SETTINGS_KEY),
			)
		frappe.cache.hdel("_user_settings", f"{USER_SETTINGS_KEY}::{row.user}")

	for name in LEGACY_SUCCESSORS:
		if frappe.db.exists("UI Theme", name):
			frappe.db.set_value("UI Theme", name, "enabled", 0, update_modified=False)

	frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)
	from erpnext_ui.core import themes

	themes.clear_cache()
