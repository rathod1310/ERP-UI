"""Theme catalog: UI Theme records resolved into complete token maps."""

import frappe

from erpnext_ui.theme import resolver
from erpnext_ui.theme.presets import PRESETS
from erpnext_ui.theme.tokens import RECIPES, THEME_COLOR_TOKENS, field_for

CATALOG_CACHE_KEY = "erpnext_ui:catalog"

THEME_FIELDS = [
	"name",
	"theme_key",
	"mode",
	"description",
	"is_standard",
	"enabled",
	"sort_order",
	"based_on",
	"corner_radius",
	"shadow_style",
	"heading_weight",
	*RECIPES,
	*(field_for(t) for t in THEME_COLOR_TOKENS),
]


def row_to_definition(row) -> dict:
	"""A UI Theme row (dict or Document) -> resolver definition."""
	get = row.get
	colours = {t: get(field_for(t)) for t in THEME_COLOR_TOKENS if get(field_for(t))}
	try:
		weight = int(get("heading_weight") or 0) or None
	except (TypeError, ValueError):
		weight = None
	return {
		"mode": get("mode"),
		"colours": colours,
		"corner_radius": get("corner_radius"),
		"shadow_style": get("shadow_style"),
		"heading_weight": weight,
		"recipe": {f: get(f) for f in RECIPES if get(f)},
	}


def preset_definition(name: str) -> dict:
	preset = PRESETS[name]
	return {
		k: preset[k] for k in ("mode", "colours", "corner_radius", "shadow_style", "heading_weight", "recipe")
	}


def _load_rows() -> list[dict]:
	if not frappe.db.table_exists("UI Theme"):
		return []
	# Only columns the table has: the app's code is shared by every site on the
	# bench, and a site that has not been migrated yet still has the older
	# schema. Missing fields (for example the recipe) then use their defaults.
	columns = set(frappe.db.get_table_columns("UI Theme"))
	fields = [f for f in THEME_FIELDS if f in columns]
	return frappe.get_all("UI Theme", fields=fields, order_by="sort_order asc, name asc")


def build_catalog(accent: str | None = None) -> list[dict]:
	"""All enabled themes, fully resolved. Falls back to the code presets when
	the table is empty (for example before the first migrate)."""
	rows = _load_rows()
	by_name = {r.name: r for r in rows}
	if not rows:
		rows = [
			frappe._dict(
				name=name,
				theme_key=resolver.slug(name),
				description=p["description"],
				is_standard=1,
				enabled=1,
				sort_order=p["sort_order"],
				based_on=None,
				**{"mode": p["mode"]},
			)
			for name, p in PRESETS.items()
		]

	catalog = []
	for row in rows:
		if not row.get("enabled"):
			continue
		if row.name in PRESETS and not by_name:
			defn = preset_definition(row.name)
		else:
			defn = row_to_definition(row)
		base = by_name.get(row.get("based_on")) if row.get("based_on") else None
		complete = resolver.complete_definition(defn, row_to_definition(base) if base else None)
		if accent:
			try:
				complete = resolver.apply_accent(complete, accent)
			except ValueError:
				pass
		catalog.append(
			{
				"name": row.name,
				"key": row.get("theme_key") or resolver.slug(row.name),
				"mode": complete["mode"],
				"description": row.get("description") or "",
				"is_standard": int(row.get("is_standard") or 0),
				"tokens": resolver.to_tokens(complete),
				"recipe": resolver.recipe_attributes(complete["recipe"]),
			}
		)
	return catalog


def get_catalog(accent: str | None = None) -> list[dict]:
	cache_key = f"{CATALOG_CACHE_KEY}:{accent or '-'}"
	cached = frappe.cache.get_value(cache_key)
	if cached is not None:
		return cached
	catalog = build_catalog(accent)
	frappe.cache.set_value(cache_key, catalog, expires_in_sec=6 * 3600)
	return catalog


def clear_cache():
	frappe.cache.delete_keys(CATALOG_CACHE_KEY)


def find(catalog: list[dict], name: str | None, mode: str) -> dict | None:
	if not name:
		return None
	for theme in catalog:
		if theme["name"] == name and theme["mode"] == mode:
			return theme
	return None


def pick(catalog: list[dict], mode: str, *candidates: str | None) -> dict | None:
	"""First candidate that exists, is enabled and has `mode`; then the standard
	fallback for that mode; then any theme of that mode."""
	for name in (*candidates, resolver.fallback_name(mode)):
		theme = find(catalog, name, mode)
		if theme:
			return theme
	return next((t for t in catalog if t["mode"] == mode), None)
