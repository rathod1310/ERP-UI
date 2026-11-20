import frappe
from frappe import _

from erpnext_ui.core import config, themes
from erpnext_ui.core.settings import SETTINGS_DOCTYPE
from erpnext_ui.theme import colour


@frappe.whitelist(methods=["GET"])
def get_config() -> dict:
	"""The current user's effective configuration (same shape as the boot payload)."""
	return config.build_config()


@frappe.whitelist(methods=["GET"])
def get_catalog() -> list[dict]:
	"""Enabled themes with resolved tokens, without any accent override."""
	return themes.get_catalog()


@frappe.whitelist(methods=["POST"])
def preview_catalog(accent_color: str | None = None) -> list[dict]:
	"""Themes resolved with an unsaved accent colour, for the settings preview.

	Read-only: nothing is stored. Restricted to settings managers because only
	they can choose an accent.
	"""
	frappe.has_permission(SETTINGS_DOCTYPE, "write", throw=True)
	if accent_color:
		if not colour.is_hex(accent_color):
			frappe.throw(_("Accent colour must be a #rrggbb value"), frappe.ValidationError)
		return themes.build_catalog(accent_color.lower())
	return themes.get_catalog()


def _generate(primary, secondary, mode, strength) -> dict:
	from erpnext_ui.theme import generator

	for value in (primary, secondary):
		if not colour.is_hex(value or ""):
			frappe.throw(_("Colours must be #rrggbb values"), frappe.ValidationError)
	try:
		return generator.generate(primary, secondary, mode or "Light", strength or "Subtle")
	except ValueError as e:
		frappe.throw(str(e), frappe.ValidationError)


@frappe.whitelist(methods=["POST"])
def generate_theme(primary: str, secondary: str, mode: str = "Light", strength: str = "Subtle") -> dict:
	"""A theme generated from two colours, as a catalog entry for previewing,
	with its contrast report. Read-only: nothing is stored."""
	frappe.has_permission("UI Theme", "create", throw=True)
	from erpnext_ui.theme import resolver

	defn = _generate(primary, secondary, mode, strength)
	return {
		"theme": {
			"name": _("Generated Theme"),
			"key": "generated-preview",
			"mode": defn["mode"],
			"description": "",
			"is_standard": 0,
			"tokens": resolver.to_tokens(defn),
			"recipe": resolver.recipe_attributes(defn["recipe"]),
		},
		"contrast": resolver.contrast_report(defn["colours"]),
	}


@frappe.whitelist(methods=["POST"])
def create_custom_theme(
	theme_name: str, primary: str, secondary: str, mode: str = "Light", strength: str = "Subtle"
) -> str:
	"""Save a generated theme as a custom UI Theme (permission: create UI Theme)."""
	frappe.has_permission("UI Theme", "create", throw=True)
	from erpnext_ui.theme.tokens import field_for

	defn = _generate(primary, secondary, mode, strength)
	doc = frappe.get_doc(
		{
			"doctype": "UI Theme",
			"theme_name": (theme_name or "").strip(),
			"mode": defn["mode"],
			"enabled": 1,
			"sort_order": 200,
			"description": _("Generated from {0} and {1} ({2}).").format(primary, secondary, _(strength)),
			"corner_radius": defn["corner_radius"],
			"shadow_style": defn["shadow_style"],
			"heading_weight": str(defn["heading_weight"]),
			**defn["recipe"],
			**{field_for(t): v for t, v in defn["colours"].items()},
		}
	)
	doc.insert()
	return doc.name
