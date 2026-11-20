"""Create and remove the throwaway users the browser test logs in with.

Run through `bench execute` (which commits). Refuses to run on sites without
`allow_tests`, so it cannot touch a production site by accident.
"""

import frappe
from frappe.utils.password import update_password

from erpnext_ui.core.preferences import USER_SETTINGS_KEY

E2E_USERS = {
	"eui-e2e-admin@example.com": [
		"System Manager",
		"Accounts Manager",
		"Accounts User",
		"Sales Manager",
		"Sales User",
		"Purchase Manager",
		"Purchase User",
		"Stock Manager",
		"Stock User",
		"Item Manager",
	],
	"eui-e2e-a@example.com": ["Report Manager"],
	"eui-e2e-b@example.com": ["Report Manager"],
}


def _guard():
	if not frappe.conf.allow_tests:
		frappe.throw("Browser test users can only be created on a site with allow_tests enabled")


def setup(password: str):
	_guard()
	teardown()
	for email, roles in E2E_USERS.items():
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"roles": [{"role": r} for r in roles],
			}
		).insert(ignore_permissions=True)
		update_password(email, password)
	frappe.db.commit()


def teardown():
	_guard()
	for email in E2E_USERS:
		frappe.db.delete("__UserSettings", {"user": email})
		frappe.cache.hdel("_user_settings", f"{USER_SETTINGS_KEY}::{email}")
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, ignore_permissions=True, force=True)
		frappe.db.delete("Sessions", {"user": email})
	frappe.db.commit()
