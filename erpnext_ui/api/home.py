"""Home page data for the signed-in user. Every call acts on frappe.session.user."""

import frappe
from frappe import _

from erpnext_ui.core import home_data
from erpnext_ui.experience.packs import DEPARTMENT_KEYS


def _require_desk_user():
	user = frappe.session.user
	if user == "Guest" or frappe.get_cached_value("User", user, "user_type") != "System User":
		raise frappe.PermissionError(_("Please log in"))


@frappe.whitelist(methods=["GET"])
def get_home(design: str, department: str | None = None, refresh: int = 0) -> dict:
	_require_desk_user()
	if design not in home_data.DESIGNS:
		frappe.throw(_("Unknown home design"), frappe.ValidationError)
	if department and department not in DEPARTMENT_KEYS:
		department = None
	return home_data.get(design, department, refresh=bool(int(refresh or 0)))


@frappe.whitelist(methods=["GET"])
def get_chart(chart_name: str) -> dict | None:
	_require_desk_user()
	return home_data.chart(chart_name)


@frappe.whitelist(methods=["GET"])
def get_cards(names: str | list | None = None) -> list[dict]:
	_require_desk_user()
	names = frappe.parse_json(names) if isinstance(names, str) else names
	if not isinstance(names, list):
		return []
	return home_data.cards(names[:12])
