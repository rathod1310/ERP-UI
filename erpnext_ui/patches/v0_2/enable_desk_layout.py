"""Turn on the Phase 2 Desk layout for sites upgraded from Phase 1.

A Single loads an unset Check field as 0, so after_migrate's "fill missing
defaults" cannot tell "never set" from "switched off". This patch runs once,
after the new field is synced and before after_migrate, and stores the
default only when no value exists yet.
"""

import frappe

from erpnext_ui.core.settings import DEFAULTS, SETTINGS_DOCTYPE


def execute():
	for field in ("desk_layout", "content_width"):
		stored = frappe.db.sql(
			"select 1 from `tabSingles` where doctype = %s and field = %s", (SETTINGS_DOCTYPE, field)
		)
		if not stored:
			frappe.db.set_single_value(SETTINGS_DOCTYPE, field, DEFAULTS[field])
	frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)
