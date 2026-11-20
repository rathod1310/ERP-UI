"""Experience resolution. Pure Python, no database.

Order (later wins):
  1. the pack definition (code, or a UI Experience record);
  2. the site default pack, unless the user chose an allowed pack;
  3. the user's overrides for that pack, only for keys the site opens;
and, outside this module, site branding over everything.

The result has the same shape the theme and layout engines already use
(light_theme, dark_theme, density, font, layout values), plus the shell
component variants, so the Phase 1-3 engines need no knowledge of packs.
The browser mirrors this in public/js/experience/resolve.js; both are checked
against tests/experience_cases.json.
"""

import re

from erpnext_ui.experience.packs import (
	COMPONENTS,
	CUSTOM_HOMES,
	DEFAULT_EXPERIENCE,
	LAYOUT_OVERRIDE_KEYS,
	OVERRIDE_KEYS,
	PACKS,
	THEME_OVERRIDE_KEYS,
)
from erpnext_ui.theme import layouts
from erpnext_ui.theme.tokens import DENSITIES, FONTS

_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def is_key(value) -> bool:
	return isinstance(value, str) and bool(_KEY_RE.match(value))


def components(shell: dict | None) -> dict:
	"""A complete, valid variant per component (unknown values -> first variant)."""
	shell = shell or {}
	return {key: shell.get(key) if shell.get(key) in variants else variants[0] for key, variants in COMPONENTS.items()}


def valid_override(key: str, value) -> bool:
	if not isinstance(value, str) or not value or len(value) > 140:
		return False
	if key == "density":
		return value in DENSITIES
	if key == "font":
		return value in FONTS
	if key in LAYOUT_OVERRIDE_KEYS:
		return layouts.is_valid(key, value)
	return key in THEME_OVERRIDE_KEYS  # theme names are checked against the catalog later


def clean_overrides(data) -> dict:
	"""{pack_key: {override_key: value}} with everything unknown dropped."""
	if not isinstance(data, dict):
		return {}
	out = {}
	for pack, values in data.items():
		if not is_key(pack) or not isinstance(values, dict):
			continue
		kept = {k: values[k] for k in OVERRIDE_KEYS if valid_override(k, values.get(k))}
		if kept:
			out[pack] = kept
	return out


def normalise_pack(key: str, definition: dict) -> dict:
	"""A pack with every field present and valid (used for code and records)."""
	layout_values = {}
	given = definition.get("layout") or {}
	fallback = layouts.PRESETS[layouts.DEFAULT_PRESET]["values"]
	for name in LAYOUT_OVERRIDE_KEYS:
		value = given.get(name)
		layout_values[name] = value if layouts.is_valid(name, value) else fallback[name]
	shell = components(definition.get("shell"))
	return {
		"key": key,
		"title": definition.get("title") or key,
		"description": definition.get("description") or "",
		"audience": definition.get("audience") or "",
		"sort_order": int(definition.get("sort_order") or 0),
		"light_theme": definition.get("light_theme"),
		"dark_theme": definition.get("dark_theme"),
		"compatible_themes": list(definition.get("compatible_themes") or ()),
		"shell": shell,
		"density": definition.get("density") if definition.get("density") in DENSITIES else "Comfortable",
		"font": definition.get("font") if definition.get("font") in FONTS else "Inter",
		"layout": layout_values,
		"login": definition.get("login") or "Split",
		"home_cards": list(definition.get("home_cards") or ()),
		"home_charts": list(definition.get("home_charts") or ()),
		"custom_home": int(shell["home"] in CUSTOM_HOMES),
		"is_standard": int(bool(definition.get("is_standard", key in PACKS))),
	}


def choose(catalog: dict, *, site_default: str | None, user_choice: str | None, allowed: list | None, user_may_choose: bool) -> tuple[str | None, str]:
	"""(pack key, source). `catalog` maps key -> normalised pack (enabled only).

	`allowed` is the administrator's allowed list (empty or None: every
	enabled pack). The site default is always usable even when it is not in
	the allowed list, so a site can never end up without an experience.
	"""
	allowed_set = set(allowed or catalog)
	if user_may_choose and user_choice in catalog and user_choice in allowed_set:
		return user_choice, "user"
	if site_default in catalog:
		return site_default, "site"
	if DEFAULT_EXPERIENCE in catalog:
		return DEFAULT_EXPERIENCE, "fallback"
	ordered = sorted(catalog.values(), key=lambda p: (p["sort_order"], p["key"]))
	return (ordered[0]["key"], "fallback") if ordered else (None, "none")


def available(catalog: dict, allowed: list | None, site_default: str | None) -> list[str]:
	"""Pack keys a user may pick, in display order."""
	allowed_set = set(allowed or catalog)
	if site_default in catalog:
		allowed_set.add(site_default)
	keys = [k for k in catalog if k in allowed_set]
	return sorted(keys, key=lambda k: (catalog[k]["sort_order"], k))


def apply(pack: dict, overrides: dict | None, *, theme_open: bool, layout_open: dict) -> dict:
	"""The effective selection for one pack.

	`theme_open`: users may change theme, density and font (allow_user_selection).
	`layout_open`: layout permission group -> bool (the allow_* switches).
	Returns the selection, the layout values and where each value came from.
	"""
	overrides = overrides or {}
	selection, sources = {}, {}
	for key in THEME_OVERRIDE_KEYS:
		if theme_open and valid_override(key, overrides.get(key)):
			selection[key], sources[key] = overrides[key], "user"
		else:
			selection[key], sources[key] = pack[key], "pack"
	values = {}
	for key in LAYOUT_OVERRIDE_KEYS:
		if layout_open.get(layouts.group_of(key)) and valid_override(key, overrides.get(key)):
			values[key], sources[key] = overrides[key], "user"
		else:
			values[key], sources[key] = pack["layout"][key], "pack"
	return {"selection": selection, "layout": values, "sources": sources}


def diff_overrides(pack: dict, values: dict) -> dict:
	"""Only the values that differ from the pack (what is worth storing)."""
	out = {}
	for key in OVERRIDE_KEYS:
		value = values.get(key)
		if not valid_override(key, value):
			continue
		default = pack["layout"][key] if key in LAYOUT_OVERRIDE_KEYS else pack[key]
		if value != default:
			out[key] = value
	return out
