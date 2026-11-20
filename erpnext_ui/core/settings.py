"""Global configuration (UI Experience Settings) with safe defaults."""

import frappe

from erpnext_ui.experience import resolve as experience_resolve
from erpnext_ui.experience.packs import DEFAULT_EXPERIENCE
from erpnext_ui.theme import colour
from erpnext_ui.theme.presets import FALLBACK_DARK, FALLBACK_LIGHT
from erpnext_ui.theme import layouts
from erpnext_ui.theme.tokens import APPEARANCES, DENSITIES, FONTS

SETTINGS_DOCTYPE = "UI Experience Settings"

DEFAULTS = {
	"enabled": 1,
	"default_experience": DEFAULT_EXPERIENCE,
	"allow_user_experience": 1,
	"allow_user_selection": 1,
	"debug_logging": 0,
	"default_appearance": "Light",
	"default_light_theme": FALLBACK_LIGHT,
	"default_dark_theme": FALLBACK_DARK,
	"default_density": "Comfortable",
	"default_font": "Inter",
	"accent_color": None,
	"enable_backdrops": 1,
	"backdrop_through_panels": 0,
	"desk_layout": 1,
	"default_layout_preset": layouts.DEFAULT_PRESET,
	"default_navigation": None,
	"default_workspace_format": None,
	"default_form_format": None,
	"default_list_format": None,
	"content_width": None,
	"default_card_style": None,
	"default_page_background": None,
	"allow_layout_preset": 1,
	"allow_navigation": 1,
	"allow_workspace_format": 1,
	"allow_form_format": 1,
	"allow_list_format": 1,
	"allow_content_options": 1,
}

# Layout category -> settings field holding the site default (blank: from the preset).
LAYOUT_DEFAULT_FIELDS = {
	"navigation": "default_navigation",
	"workspace_format": "default_workspace_format",
	"form_format": "default_form_format",
	"list_format": "default_list_format",
	"content_width": "content_width",
	"card_style": "default_card_style",
	"page_background": "default_page_background",
}

# Permission group -> settings field that lets users change it.
LAYOUT_ALLOW_FIELDS = {
	"layout_preset": "allow_layout_preset",
	"navigation": "allow_navigation",
	"workspace": "allow_workspace_format",
	"forms": "allow_form_format",
	"lists": "allow_list_format",
	"content": "allow_content_options",
}

CHECK_FIELDS = (
	"enabled",
	"allow_user_experience",
	"allow_user_selection",
	"debug_logging",
	"enable_backdrops",
	"backdrop_through_panels",
	"desk_layout",
	*LAYOUT_ALLOW_FIELDS.values(),
)


def get_settings() -> frappe._dict:
	"""Settings with every value checked; anything invalid becomes its default.

	Never raises: a broken or missing settings record must not stop Desk from
	loading, so the worst case is the defaults.
	"""
	out = frappe._dict(DEFAULTS)
	out.allowed_experiences = []
	try:
		if not frappe.db.table_exists("Singles"):
			return out
		doc = frappe.get_cached_doc(SETTINGS_DOCTYPE)
	except Exception:
		return out

	for key in CHECK_FIELDS:
		value = doc.get(key)
		if value is not None:
			out[key] = 1 if int(value or 0) else 0
	if experience_resolve.is_key(doc.get("default_experience")):
		out.default_experience = doc.default_experience
	out.allowed_experiences = [
		row.experience for row in doc.get("allowed_experiences") or [] if experience_resolve.is_key(row.experience)
	]
	if doc.get("default_appearance") in APPEARANCES:
		out.default_appearance = doc.default_appearance
	if doc.get("default_density") in DENSITIES:
		out.default_density = doc.default_density
	if layouts.is_valid("layout_preset", doc.get("default_layout_preset")):
		out.default_layout_preset = doc.default_layout_preset
	for key, fieldname in LAYOUT_DEFAULT_FIELDS.items():
		if layouts.is_valid(key, doc.get(fieldname)):
			out[fieldname] = doc.get(fieldname)
	if doc.get("default_font") in FONTS:
		out.default_font = doc.default_font
	for key in ("default_light_theme", "default_dark_theme"):
		if doc.get(key):
			out[key] = doc.get(key)
	if doc.get("accent_color") and colour.is_hex(doc.accent_color):
		out.accent_color = doc.accent_color.lower()
	return out


def apply_defaults(doc, only_missing=True):
	"""Write DEFAULTS onto a settings document (used by install and reset)."""
	for key, value in DEFAULTS.items():
		if only_missing and doc.get(key) not in (None, ""):
			continue
		doc.set(key, value)
	return doc


def layout_site_values(settings) -> dict:
	"""The administrator's per-category layout defaults (unset ones omitted)."""
	return {key: settings[field] for key, field in LAYOUT_DEFAULT_FIELDS.items() if settings.get(field)}


def layout_allowed(settings) -> dict:
	"""Which layout groups users may change themselves."""
	return {group: bool(settings.get(field)) for group, field in LAYOUT_ALLOW_FIELDS.items()}
