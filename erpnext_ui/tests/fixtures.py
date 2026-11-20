"""Base class and helpers for the integration tests.

Every test runs inside a savepoint that is rolled back afterwards. Redis-held
state (per-user settings, the theme catalog and cached documents) is cleared
as well, because a database rollback does not reach it.
"""

import frappe
from frappe.tests import IntegrationTestCase

from erpnext_ui.core import experience, themes
from erpnext_ui.core.preferences import USER_SETTINGS_KEY
from erpnext_ui.core.settings import SETTINGS_DOCTYPE

USER_A = "eui-user-a@example.com"
USER_B = "eui-user-b@example.com"
MANAGER = "eui-manager@example.com"
TEST_USERS = (USER_A, USER_B, MANAGER)


def make_user(email: str, *roles: str) -> str:
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"roles": [{"role": role} for role in roles],
			}
		).insert(ignore_permissions=True)
	return email


def clear_runtime_state():
	for user in (*TEST_USERS, "Administrator"):
		frappe.cache.hdel("_user_settings", f"{USER_SETTINGS_KEY}::{user}")
		frappe.clear_document_cache("User", user)
	frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)
	themes.clear_cache()
	experience.clear_cache()


class UITestCase(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		make_user(USER_A, "Report Manager")
		make_user(USER_B, "Report Manager")
		make_user(MANAGER, "System Manager")

	def setUp(self):
		super().setUp()
		clear_runtime_state()
		frappe.db.savepoint("eui_test")
		self.addCleanup(clear_runtime_state)
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback, save_point="eui_test")
		frappe.set_user("Administrator")

	def set_setting(self, **values):
		doc = frappe.get_doc(SETTINGS_DOCTYPE)
		doc.update(values)
		doc.save(ignore_permissions=True)
		return doc

	def custom_theme(self, name="Test Custom Light", mode="Light", **values):
		base = "Corporate Blue" if mode == "Light" else "Graphite Dark"
		doc = frappe.get_doc(
			{"doctype": "UI Theme", "theme_name": name, "mode": mode, "based_on": base, **values}
		)
		doc.insert(ignore_permissions=True)
		return doc
