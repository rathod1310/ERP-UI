"""Version detection and adapter selection.

Only versions that have actually been tested get an adapter. On any other
Frappe major version the theme engine stays inactive and the native Desk is
left untouched (see docs/compatibility.md).
"""

import frappe

# Frappe major version -> adapter key understood by public/js/adapters.
# v17 keeps the v16 Desk structure (body-sidebar, page-head, layout-main
# section, datatable), so it runs the same adapter; the few differences are
# keyed on html[data-ui-frappe="17"].
ADAPTERS = {16: "v16", 17: "v16"}

# The exact versions the current release was tested against.
TESTED = {"frappe": "16.34.0", "erpnext": "16.35.0"}


def _major(version: str | None) -> int | None:
	try:
		return int(str(version).split(".")[0])
	except (TypeError, ValueError):
		return None


def installed_versions() -> dict[str, str | None]:
	versions = {"frappe": frappe.__version__, "erpnext": None}
	try:
		import erpnext

		versions["erpnext"] = erpnext.__version__
	except ImportError:
		pass
	return versions


def adapter_key(frappe_version: str | None = None) -> str | None:
	return ADAPTERS.get(_major(frappe_version or frappe.__version__))


def status() -> dict:
	versions = installed_versions()
	key = adapter_key(versions["frappe"])
	return {
		"versions": versions,
		"adapter": key,
		"frappe_major": _major(versions["frappe"]),
		"supported": bool(key),
		"tested": TESTED,
		"exact_tested_match": versions["frappe"] == TESTED["frappe"]
		and versions["erpnext"] in (None, TESTED["erpnext"]),
	}
