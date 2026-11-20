"""Administrator endpoints. Each one checks write permission on UI Experience
Settings, so whoever the site's role permissions allow (System Manager by
default) can use them, and nobody else."""

import frappe

from frappe import _

from erpnext_ui.api.preferences import validate_themes
from erpnext_ui.core import compat, config
from erpnext_ui.core import experience as exp
from erpnext_ui.core.settings import SETTINGS_DOCTYPE, apply_defaults, get_settings
from erpnext_ui.theme.tokens import APPEARANCES


def _require_manager():
	frappe.has_permission(SETTINGS_DOCTYPE, "write", throw=True)


@frappe.whitelist(methods=["POST"])
def publish_defaults(
	experience: str | None = None,
	appearance: str | None = None,
	light_theme: str | None = None,
	dark_theme: str | None = None,
) -> dict:
	"""Make an experience (and optionally an appearance) the site default.
	light_theme / dark_theme set the fallback themes used when an
	experience's own theme is unavailable."""
	_require_manager()
	settings = get_settings()
	doc = frappe.get_doc(SETTINGS_DOCTYPE)
	if experience:
		if not exp.home_page_ready():
			from erpnext_ui.api.preferences import SITE_NOT_UPDATED

			frappe.throw(_(SITE_NOT_UPDATED), frappe.ValidationError, title=_("Site Not Updated"))
		if experience not in exp.get_catalog():
			frappe.throw(_("{0} is not an enabled experience").format(frappe.bold(experience)), frappe.ValidationError)
		doc.default_experience = experience
	if appearance:
		if appearance not in APPEARANCES:
			frappe.throw(_("Invalid appearance"), frappe.ValidationError)
		doc.default_appearance = appearance
	clean = validate_themes({"light_theme": light_theme, "dark_theme": dark_theme}, settings)
	for key, fieldname in (("light_theme", "default_light_theme"), ("dark_theme", "default_dark_theme")):
		if clean.get(key):
			doc.set(fieldname, clean[key])
	doc.save()
	return config.build_config()


@frappe.whitelist(methods=["POST"])
def reset_settings() -> dict:
	"""Restore every global setting to its shipped default."""
	_require_manager()
	doc = frappe.get_doc(SETTINGS_DOCTYPE)
	apply_defaults(doc, only_missing=False)
	doc.save()
	return config.build_config()


@frappe.whitelist(methods=["GET"])
def get_status() -> dict:
	_require_manager()
	return compat.status()
