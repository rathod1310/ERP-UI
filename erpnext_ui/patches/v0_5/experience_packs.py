"""M2 -> M3: themes and layout presets become Experience Packs.

0. Store "Allow Users to Choose Their Experience" (on) where never stored.
1. Sync the theme collection (two new themes) and the standard packs, so the
   site default can point at a real record.
2. Site default experience: from the retired layout preset
   (packs.LEGACY_LAYOUT_PRESETS), unless one is already set.
3. Every user's saved choices (decision D2): the user follows the site
   default pack, and the theme, density, font and per-category layout values
   they had saved are kept as their adjustments to that pack, where they
   differ from it. A layout preset choice is not carried over (presets are
   retired, decision D3). The original values are kept under "_legacy";
   nothing is deleted. Rows already in the new shape are left alone.
"""

import json

import frappe

from erpnext_ui.core.preferences import LEGACY_KEYS, USER_SETTINGS_KEY
from erpnext_ui.core.settings import SETTINGS_DOCTYPE
from erpnext_ui.experience import resolve
from erpnext_ui.experience.packs import DEFAULT_EXPERIENCE, LEGACY_LAYOUT_PRESETS, PACKS
from erpnext_ui.theme.tokens import APPEARANCES


def execute():
	from erpnext_ui.install import sync_standard_experiences, sync_standard_themes

	sync_standard_themes()
	sync_standard_experiences()

	_store_new_checks()
	site_pack = _site_default()
	pack = resolve.normalise_pack(site_pack, PACKS[site_pack])
	rows = frappe.db.sql(
		"select `user`, `data` from `__UserSettings` where `doctype`=%s", USER_SETTINGS_KEY, as_dict=True
	)
	for row in rows:
		new = migrate_row(row.data, site_pack, pack)
		if new is None:
			continue
		frappe.db.sql(
			"update `__UserSettings` set `data`=%s where `user`=%s and `doctype`=%s",
			(json.dumps(new), row.user, USER_SETTINGS_KEY),
		)
		frappe.cache.hdel("_user_settings", f"{USER_SETTINGS_KEY}::{row.user}")


def _store_new_checks():
	"""A Single loads an unset Check as 0, so after_migrate cannot tell "never
	set" from "switched off": store the shipped default where nothing is stored."""
	stored = frappe.db.sql(
		"select 1 from `tabSingles` where `doctype`=%s and `field`='allow_user_experience'", SETTINGS_DOCTYPE
	)
	if not stored:
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "allow_user_experience", 1)


def _site_default() -> str:
	current = frappe.db.sql(
		"select `value` from `tabSingles` where `doctype`=%s and `field`='default_experience'", SETTINGS_DOCTYPE
	)
	if current and current[0][0] in PACKS:
		return current[0][0]
	preset = frappe.db.sql(
		"select `value` from `tabSingles` where `doctype`=%s and `field`='default_layout_preset'", SETTINGS_DOCTYPE
	)
	key = LEGACY_LAYOUT_PRESETS.get(preset[0][0] if preset else None, DEFAULT_EXPERIENCE)
	frappe.db.set_single_value(SETTINGS_DOCTYPE, "default_experience", key)
	return key


def migrate_row(raw, site_pack: str, pack: dict):
	"""The new value for one stored row, or None to leave it unchanged."""
	try:
		data = json.loads(raw or "{}")
	except ValueError:
		return None
	if not isinstance(data, dict) or "experience" in data or "overrides" in data or "_legacy" in data:
		return None
	legacy = {k: data[k] for k in LEGACY_KEYS if isinstance(data.get(k), str) and data.get(k)}
	new = {}
	if data.get("appearance") in APPEARANCES:
		new["appearance"] = data["appearance"]
	if not legacy:
		return new if new != data else None
	overrides = resolve.diff_overrides(pack, {k: v for k, v in legacy.items() if k != "layout_preset"})
	if overrides:
		new["overrides"] = {site_pack: overrides}
	new["_legacy"] = legacy
	return new
