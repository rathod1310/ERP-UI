import frappe
from frappe.utils.change_log import get_versions as frappe_get_versions

from erpnext_ui.core import branding


@frappe.whitelist()
def get_versions(include_disabled: bool = False):
	"""frappe.utils.change_log.get_versions with the brand applied (About dialog)."""
	try:
		versions = frappe_get_versions(include_disabled)
	except TypeError:
		versions = frappe_get_versions()
	return branding.brand_versions(versions)
