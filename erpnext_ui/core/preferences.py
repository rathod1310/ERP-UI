"""Per-user preferences.

Storage, deliberately without a new DocType:

* Theme, density, font, an explicit appearance choice and the layout choices
  (preset and per-category formats) live in Frappe's per-user settings store
  (`__UserSettings`, key USER_SETTINGS_KEY). Writes go to the Redis copy and to
  the table at once so a cache flush cannot lose them.
* Appearance is mirrored to Frappe's own `User.desk_theme` (the field the
  native "Toggle Theme" dialog writes), so the server renders `data-theme`
  correctly before any script runs. `desk_theme` alone cannot say whether a
  user chose "Light" (Frappe fills new users' Select field with its first
  option), which is why the explicit choice is also recorded here.

The user is always `frappe.session.user`; no function here accepts a user id
from a request.
"""

import json

import frappe
from frappe.model.utils.user_settings import get_user_settings, update_user_settings

from erpnext_ui.experience import resolve as experience_resolve
from erpnext_ui.theme import layouts
from erpnext_ui.theme.tokens import APPEARANCES

USER_SETTINGS_KEY = "UI Experience Settings"
# Phase 1-3 M2 top-level keys. Since M3 they live per pack under "overrides";
# patch v0_5 moved them and kept a copy under "_legacy".
PERSONAL_THEME_KEYS = ("light_theme", "dark_theme", "density", "font")
PERSONAL_LAYOUT_KEYS = ("layout_preset", *layouts.LAYOUT_KEYS)
LEGACY_KEYS = (*PERSONAL_THEME_KEYS, *PERSONAL_LAYOUT_KEYS)


def sanitise(data) -> dict:
	"""Only known keys with plausible values survive. The raw store can be
	written by Frappe's generic user-settings API, so it is never trusted.

	Shape: {"experience": key, "appearance": "Light|Dark|Automatic",
	"overrides": {pack_key: {override_key: value}}, "_legacy": {...}}.
	"""
	if isinstance(data, str):
		try:
			data = json.loads(data or "{}")
		except ValueError:
			return {}
	if not isinstance(data, dict):
		return {}
	out = {}
	if experience_resolve.is_key(data.get("experience")):
		out["experience"] = data["experience"]
	if data.get("appearance") in APPEARANCES:
		out["appearance"] = data["appearance"]
	overrides = experience_resolve.clean_overrides(data.get("overrides"))
	if overrides:
		out["overrides"] = overrides
	legacy = data.get("_legacy")
	if isinstance(legacy, dict):
		kept = {k: v for k, v in legacy.items() if k in LEGACY_KEYS and isinstance(v, str) and len(v) <= 140}
		if kept:
			out["_legacy"] = kept
	return out


def get_saved() -> dict:
	if frappe.session.user == "Guest":
		return {}
	try:
		return sanitise(get_user_settings(USER_SETTINGS_KEY))
	except Exception:
		return {}


def _persist(data: dict, user: str | None = None):
	user = user or frappe.session.user
	payload = json.dumps(data)
	if user == frappe.session.user:
		# Replace (not merge) the cached copy, then write through to the table.
		update_user_settings(USER_SETTINGS_KEY, payload, for_update=True)
	else:
		frappe.cache.hdel("_user_settings", f"{USER_SETTINGS_KEY}::{user}")
	frappe.db.multisql(
		{
			"mariadb": """INSERT INTO `__UserSettings` (`user`, `doctype`, `data`)
				VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE `data`=%s""",
			"*": """INSERT INTO `__UserSettings` (`user`, `doctype`, `data`)
				VALUES (%s, %s, %s) ON CONFLICT (`user`, `doctype`) DO UPDATE SET `data`=%s""",
		},
		(user, USER_SETTINGS_KEY, payload, payload),
	)


def save(*, experience=..., appearance=..., overrides: dict | None = None, pack: str | None = None) -> dict:
	"""Update the stored preferences.

	experience / appearance: a value to store, None to forget, ... to keep.
	overrides: for `pack`, the complete new set of overrides (already reduced
	to the values that differ from the pack). An empty dict clears them.
	"""
	data = get_saved()
	for key, value in (("experience", experience), ("appearance", appearance)):
		if value is ...:
			continue
		if value in (None, ""):
			data.pop(key, None)
		else:
			data[key] = value
	if overrides is not None and experience_resolve.is_key(pack):
		all_overrides = data.get("overrides") or {}
		if overrides:
			all_overrides[pack] = overrides
		else:
			all_overrides.pop(pack, None)
		if all_overrides:
			data["overrides"] = all_overrides
		else:
			data.pop("overrides", None)
	data = sanitise(data)
	_persist(data)
	return data


def clear():
	"""Forget everything (choice, appearance, overrides); legacy copy is kept."""
	data = get_saved()
	_persist({"_legacy": data["_legacy"]} if data.get("_legacy") else {})


def get_appearance(saved: dict | None = None) -> str | None:
	"""The user's own Light/Dark/Automatic choice, or None if never made.

	An explicit choice recorded by this app wins. Otherwise a desk_theme of
	Dark or Automatic is a choice made earlier with Frappe's own dialog, while
	"Light" is indistinguishable from Frappe's default and counts as no choice.
	"""
	if frappe.session.user == "Guest":
		return None
	saved = get_saved() if saved is None else saved
	if saved.get("appearance") in APPEARANCES:
		return saved["appearance"]
	value = frappe.db.get_value("User", frappe.session.user, "desk_theme")
	return value if value in ("Dark", "Automatic") else None


def set_appearance(value: str | None):
	if value is not None and value not in APPEARANCES:
		raise ValueError(value)
	frappe.db.set_value("User", frappe.session.user, "desk_theme", value, update_modified=False)
