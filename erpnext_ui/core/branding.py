"""White-label branding: the product is shown as SKYDOTERP, never as ERPNext.

Three layers, none of which modify ERPNext or Frappe code:

- boot (`apply_to_boot`): app titles and logos in `bootinfo.app_data`, which
  the sidebar header, dock and apps screen read, plus the navbar logo;
- the browser (`public/js/branding.js`): every string passed through `__()`
  has "ERPNext" replaced by the brand name, and the tab title follows it;
- site settings (`apply_site_branding`, on install and migrate): the
  application name, logo, splash image and favicon used by the login page,
  splash screen and browser tab. Only empty values or the stock
  ERPNext/Frappe ones are replaced, so an administrator's own branding wins.
"""

import frappe

BRAND_NAME = "SKYDOTERP"
LOGO = "/assets/erpnext_ui/images/skydoterp-logo.png"
MARK = "/assets/erpnext_ui/images/skydoterp-mark.png"
FAVICON = "/assets/erpnext_ui/images/skydoterp-favicon.png"

# Names shown by stock apps that the brand replaces.
REPLACED_TITLES = {"ERPNext"}
STOCK_NAMES = {"", "erpnext", "frappe", "frappe framework"}


def config() -> dict:
	return {"name": BRAND_NAME, "logo": LOGO, "mark": MARK, "favicon": FAVICON, "replace": ["ERPNext"]}


def apply_to_boot(bootinfo) -> None:
	for app in bootinfo.get("app_data") or []:
		if not isinstance(app, dict):
			continue
		title = app.get("app_title") or ""
		if app.get("app_name") == "erpnext" or title in REPLACED_TITLES:
			app["app_title"] = BRAND_NAME
			app["app_logo_url"] = MARK
	for icon in bootinfo.get("desktop_icons") or []:
		if not isinstance(icon, dict) or icon.get("icon_type") != "App":
			continue
		if icon.get("app") == "erpnext" or icon.get("label") in REPLACED_TITLES:
			icon["label"] = BRAND_NAME
			icon["logo_url"] = MARK
			if icon.get("icon_image") and not _is_custom_logo(icon.get("icon_image")):
				icon["icon_image"] = MARK
	if not _is_custom_logo(bootinfo.get("app_logo_url")):
		bootinfo.app_logo_url = MARK


def _is_custom_logo(url) -> bool:
	if isinstance(url, list | tuple):
		url = url[0] if url else None
	if not url:
		return False
	return not any(stock in str(url) for stock in ("/assets/erpnext/", "/assets/frappe/", "/skydoterp-"))


def apply_site_branding() -> None:
	"""Set name, logo, splash and favicon where the site still uses stock values."""
	_update_single(
		"Website Settings",
		{
			"app_name": (BRAND_NAME, _is_stock_name),
			"app_logo": (LOGO, lambda v: not _is_custom_logo(v)),
			"splash_image": (LOGO, lambda v: not _is_custom_logo(v)),
			"favicon": (FAVICON, lambda v: not _is_custom_logo(v)),
			"footer_powered": (f"Powered by {BRAND_NAME}", lambda v: not (v or "").strip()),
		},
	)
	_update_single("System Settings", {"app_name": (BRAND_NAME, _is_stock_name)})
	_update_single("Navbar Settings", {"app_logo": (MARK, lambda v: not _is_custom_logo(v))})


def _is_stock_name(value) -> bool:
	return (value or "").strip().lower() in STOCK_NAMES


def _update_single(doctype: str, values: dict) -> None:
	meta = frappe.get_meta(doctype)
	changes = {}
	for field, (value, replace) in values.items():
		if not meta.has_field(field):
			continue
		if replace(frappe.db.get_single_value(doctype, field)):
			changes[field] = value
	if changes:
		frappe.db.set_single_value(doctype, changes)
		frappe.clear_cache(doctype=doctype)
