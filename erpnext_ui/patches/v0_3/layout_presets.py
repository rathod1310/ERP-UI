"""Phase 3 milestone 1: layout presets.

1. Store defaults for the new settings fields where nothing is stored yet (a
   Single loads an unset Check field as 0, so after_migrate's "fill missing
   defaults" would switch the user permissions off).
2. Phase 2 stored content_width "Full Width" for "the page uses the screen,
   forms and workspaces keep their readable width". That behaviour is now the
   "Standard" width of the default Modern preset, while "Full Width" means
   truly full width. Clear the old value so the preset applies; "Contained"
   keeps its meaning.
"""

import frappe

from erpnext_ui.core.settings import DEFAULTS, LAYOUT_ALLOW_FIELDS, SETTINGS_DOCTYPE

NEW_FIELDS = ("default_layout_preset", *LAYOUT_ALLOW_FIELDS.values())


def _stored(field):
	rows = frappe.db.sql(
		"select value from `tabSingles` where doctype = %s and field = %s", (SETTINGS_DOCTYPE, field)
	)
	return rows[0][0] if rows else None


def execute():
	for field in NEW_FIELDS:
		if _stored(field) is None:
			frappe.db.set_single_value(SETTINGS_DOCTYPE, field, DEFAULTS[field])
	if _stored("content_width") == "Full Width":
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "content_width", "")
	frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)
