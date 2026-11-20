"""UI Experience records -> the resolved experience catalog, and the per-request choice.

The catalog (every enabled pack, normalised by experience.resolve) is cached
in Redis and cleared whenever a UI Experience, a UI Theme or the settings are
saved. Reading tolerates a site whose schema predates the DocType: it falls
back to the packs in code, so Desk keeps loading until the site is migrated.
"""

import frappe

from erpnext_ui.experience import resolve
from erpnext_ui.experience.packs import COMPONENT_KEYS, HOME_PAGE, LAYOUT_OVERRIDE_KEYS, PACKS

DOCTYPE = "UI Experience"
CACHE_KEY = "erpnext_ui:experiences"


def _lines(value) -> list[str]:
	return [line.strip() for line in (value or "").splitlines() if line.strip()]


def row_to_definition(row) -> dict:
	return {
		"title": row.get("experience_name"),
		"description": row.get("description"),
		"audience": row.get("audience"),
		"sort_order": row.get("sort_order"),
		"light_theme": row.get("light_theme"),
		"dark_theme": row.get("dark_theme"),
		"compatible_themes": _lines(row.get("compatible_themes")),
		"shell": {key: row.get(f"shell_{key}") for key in COMPONENT_KEYS},
		"density": row.get("density"),
		"font": row.get("font"),
		"layout": {key: row.get(f"layout_{key}") for key in LAYOUT_OVERRIDE_KEYS},
		"login": row.get("login_layout"),
		"home_cards": _lines(row.get("home_cards")),
		"home_charts": _lines(row.get("home_charts")),
		"is_standard": row.get("is_standard"),
	}


def definition_to_values(definition: dict) -> dict:
	"""Field values for a UI Experience record (used by the standard sync)."""
	values = {
		"experience_name": definition["title"],
		"description": definition.get("description") or "",
		"audience": definition.get("audience") or "",
		"light_theme": definition["light_theme"],
		"dark_theme": definition["dark_theme"],
		"compatible_themes": "\n".join(definition.get("compatible_themes") or ()),
		"density": definition["density"],
		"font": definition["font"],
		"login_layout": definition.get("login") or "Split",
		"home_cards": "\n".join(definition.get("home_cards") or ()),
		"home_charts": "\n".join(definition.get("home_charts") or ()),
	}
	values.update({f"shell_{k}": v for k, v in definition["shell"].items()})
	values.update({f"layout_{k}": v for k, v in definition["layout"].items()})
	return values


def _from_code() -> dict:
	return {key: resolve.normalise_pack(key, {**p, "is_standard": 1}) for key, p in PACKS.items()}


def _load() -> dict:
	if not frappe.db.table_exists(DOCTYPE):
		return _from_code()
	rows = frappe.get_all(DOCTYPE, filters={"enabled": 1}, fields=["*"], order_by="sort_order asc, name asc")
	if not rows:
		return _from_code()
	return {row.name: resolve.normalise_pack(row.name, row_to_definition(row)) for row in rows if resolve.is_key(row.name)}


def get_catalog() -> dict:
	"""key -> normalised pack, enabled packs only, in display order."""
	cached = frappe.cache.get_value(CACHE_KEY)
	if isinstance(cached, dict) and cached:
		return cached
	catalog = _load()
	frappe.cache.set_value(CACHE_KEY, catalog)
	return catalog


HOME_READY_KEY = "erpnext_ui:home-page-ready"


def home_page_ready() -> bool:
	"""Whether this site has the ui-home Desk Page (it is created by migrate).

	The app code is shared by every site on the bench, so a site that has not
	been migrated since M3 must keep Frappe's own home page."""
	cached = frappe.cache.get_value(HOME_READY_KEY)
	if cached is not None:
		return bool(cached)
	try:
		ready = bool(frappe.db.exists("Page", HOME_PAGE)) and frappe.db.table_exists(DOCTYPE)
	except Exception:
		ready = False
	frappe.cache.set_value(HOME_READY_KEY, int(ready), expires_in_sec=600)
	return ready


APPS_PAGE = "ui-apps"
APPS_READY_KEY = "erpnext_ui:apps-page-ready"


def apps_page_ready() -> bool:
	"""Whether this site has the ui-apps Desk Page (created by migrate)."""
	cached = frappe.cache.get_value(APPS_READY_KEY)
	if cached is not None:
		return bool(cached)
	try:
		ready = bool(frappe.db.exists("Page", APPS_PAGE))
	except Exception:
		ready = False
	frappe.cache.set_value(APPS_READY_KEY, int(ready), expires_in_sec=600)
	return ready


def clear_cache():
	frappe.cache.delete_value(CACHE_KEY)
	frappe.cache.delete_value(HOME_READY_KEY)
	frappe.cache.delete_value(APPS_READY_KEY)


def allowed_list(settings) -> list[str]:
	return [k for k in settings.get("allowed_experiences") or [] if resolve.is_key(k)]
