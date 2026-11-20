import frappe

from erpnext_ui.core import branding
from erpnext_ui.core.config import safe_build_config

# Frappe's own pages that must never be replaced by an experience home.
KEEP_HOME_PAGES = ("setup-wizard",)


def extend_bootinfo(bootinfo):
	"""Runs on every Desk load (outside Frappe's boot cache), so it must stay
	cheap: settings are a cached doc and the theme and experience catalogs are
	cached in Redis.

	An experience with its own home design (Dashboard, Hub, Executive Overview,
	Department) becomes this user's home page. Frappe resolves the empty route
	through `bootinfo.home_page`, which it otherwise takes from the site-wide
	`desktop:home_page` default; setting it here makes the home per user and
	leaves the site default untouched. The native home is kept in the payload
	so the browser can go back to it when the user switches experience.
	"""
	config = safe_build_config()
	exp = config.get("experience")
	if isinstance(exp, dict):
		native = bootinfo.get("home_page")
		exp["native_home_page"] = native
		if exp.get("home_page") and native and native not in KEEP_HOME_PAGES and config.get("adapter"):
			bootinfo.home_page = exp["home_page"]
	config["brand"] = branding.config()
	bootinfo.erpnext_ui = config
	try:
		branding.apply_to_boot(bootinfo)
	except Exception:
		frappe.log_error("SKYDOTERP branding failed during boot")
