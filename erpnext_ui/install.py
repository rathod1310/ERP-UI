"""Install, migrate and uninstall hooks. All of them are idempotent."""

import frappe

from erpnext_ui.core import experience, themes
from erpnext_ui.core.preferences import USER_SETTINGS_KEY
from erpnext_ui.core.settings import SETTINGS_DOCTYPE, apply_defaults
from erpnext_ui.experience import resolve as exp_resolve
from erpnext_ui.experience.packs import PACKS
from erpnext_ui.theme import resolver
from erpnext_ui.theme.presets import PRESETS
from erpnext_ui.theme.tokens import field_for


def after_install():
	sync_standard_themes()
	sync_standard_experiences()
	ensure_settings()


def after_migrate():
	sync_standard_themes()
	sync_standard_experiences()
	ensure_settings()


def after_uninstall():
	frappe.db.delete("__UserSettings", {"doctype": USER_SETTINGS_KEY})
	keys = list(_user_settings_keys())
	if keys:
		frappe.cache.hdel("_user_settings", *keys)
	themes.clear_cache()
	experience.clear_cache()


def _user_settings_keys():
	for key in frappe.cache.hkeys("_user_settings") or []:
		key = frappe.safe_decode(key)
		if key.startswith(USER_SETTINGS_KEY + "::"):
			yield key


def sync_standard_themes():
	"""Create or update the standard presets from theme/presets.py.

	Only the definition is overwritten; an administrator's choice of
	`enabled` and `sort_order` on an existing preset is kept.
	"""
	frappe.flags.erpnext_ui_sync = True
	try:
		for name, preset in PRESETS.items():
			values = {
				"mode": preset["mode"],
				"description": preset["description"],
				"is_standard": 1,
				"based_on": None,
				"corner_radius": preset["corner_radius"],
				"shadow_style": preset["shadow_style"],
				"heading_weight": str(preset["heading_weight"]),
				"theme_key": resolver.slug(name),
			}
			values.update({field_for(t): v for t, v in preset["colours"].items()})
			values.update(preset.get("recipe") or {})
			if frappe.db.exists("UI Theme", name):
				doc = frappe.get_doc("UI Theme", name)
				doc.update(values)
			else:
				doc = frappe.get_doc(
					{
						"doctype": "UI Theme",
						"theme_name": name,
						"enabled": 1,
						"sort_order": preset["sort_order"],
					}
				)
				doc.update(values)
			doc.flags.ignore_permissions = True
			doc.save() if not doc.is_new() else doc.insert()
	finally:
		frappe.flags.erpnext_ui_sync = False
	themes.clear_cache()


def sync_standard_experiences():
	"""Create or update the standard Experience Packs from experience/packs.py.

	The definition is overwritten; an administrator's `enabled` and
	`sort_order` on an existing pack are kept. Themes must be synced first
	(the packs link to them).
	"""
	frappe.flags.erpnext_ui_sync = True
	try:
		for key, definition in PACKS.items():
			pack = exp_resolve.normalise_pack(key, {**definition, "is_standard": 1})
			values = experience.definition_to_values(pack)
			values.update({"is_standard": 1, "experience_key": key})
			if frappe.db.exists(experience.DOCTYPE, key):
				doc = frappe.get_doc(experience.DOCTYPE, key)
				doc.update(values)
				doc.flags.ignore_permissions = True
				doc.save()
			else:
				doc = frappe.get_doc(
					{"doctype": experience.DOCTYPE, "enabled": 1, "sort_order": pack["sort_order"], **values}
				)
				doc.flags.ignore_permissions = True
				doc.insert()
	finally:
		frappe.flags.erpnext_ui_sync = False
	experience.clear_cache()


def ensure_settings():
	"""Fill unset settings with defaults; never overwrite an administrator's choice."""
	doc = frappe.get_doc(SETTINGS_DOCTYPE)
	apply_defaults(doc, only_missing=True)
	doc.flags.ignore_permissions = True
	doc.save()
