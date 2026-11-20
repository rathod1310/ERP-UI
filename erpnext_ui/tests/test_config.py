from unittest.mock import patch

import frappe

from erpnext_ui.boot import extend_bootinfo
from erpnext_ui.core import compat
from erpnext_ui.core.config import TOKEN_NAMES, build_config
from erpnext_ui.theme.presets import PRESETS
from erpnext_ui.tests.fixtures import USER_A, UITestCase


class TestBootPayload(UITestCase):
	def test_payload_shape(self):
		frappe.set_user(USER_A)
		config = build_config()
		self.assertEqual(config["enabled"], 1)
		self.assertEqual(config["adapter"], "v16")
		self.assertEqual(config["token_names"], TOKEN_NAMES)
		self.assertEqual(len(config["catalog"]), len(PRESETS))
		self.assertEqual(config["can_manage"], 0)
		for theme in config["catalog"]:
			self.assertEqual(set(theme["tokens"]), set(TOKEN_NAMES), theme["name"])

	def test_disabled_payload_is_minimal(self):
		self.set_setting(enabled=0)
		config = build_config()
		self.assertEqual(config["enabled"], 0)
		self.assertNotIn("catalog", config)

	def test_extend_bootinfo_never_raises(self):
		bootinfo = frappe._dict()
		with patch("erpnext_ui.core.themes.get_catalog", side_effect=RuntimeError("boom")):
			extend_bootinfo(bootinfo)
		self.assertEqual(bootinfo.erpnext_ui["enabled"], 0)
		self.assertEqual(bootinfo.erpnext_ui["error"], 1)

	def test_extend_bootinfo_adds_payload(self):
		bootinfo = frappe._dict()
		extend_bootinfo(bootinfo)
		self.assertEqual(bootinfo.erpnext_ui["light_theme"], "Corporate Blue")

	def test_admin_default_appearance_applies_until_user_chooses(self):
		self.set_setting(default_appearance="Dark")
		frappe.db.set_value("User", USER_A, "desk_theme", None)
		frappe.set_user(USER_A)
		config = build_config()
		self.assertEqual((config["appearance"], config["appearance_source"]), ("Dark", "default"))

	def test_frappe_default_light_is_not_a_choice(self):
		"""New users get desk_theme "Light" from Frappe; the site default still applies."""
		self.set_setting(default_appearance="Dark")
		frappe.db.set_value("User", USER_A, "desk_theme", "Light")
		frappe.set_user(USER_A)
		self.assertEqual(build_config()["appearance"], "Dark")

	def test_earlier_native_dark_choice_is_respected(self):
		self.set_setting(default_appearance="Light")
		frappe.db.set_value("User", USER_A, "desk_theme", "Automatic")
		frappe.set_user(USER_A)
		config = build_config()
		self.assertEqual((config["appearance"], config["appearance_source"]), ("Automatic", "user"))

	def test_explicit_light_choice_beats_dark_default(self):
		from erpnext_ui.api.preferences import save_preferences

		self.set_setting(default_appearance="Dark")
		frappe.set_user(USER_A)
		save_preferences(appearance="Light")
		config = build_config()
		self.assertEqual((config["appearance"], config["appearance_source"]), ("Light", "user"))

	def test_settings_manager_flag(self):
		self.assertEqual(build_config()["can_manage"], 1)


class TestCompatibility(UITestCase):
	def test_adapter_selection(self):
		self.assertEqual(compat.adapter_key("16.34.0"), "v16")
		self.assertEqual(compat.adapter_key("16.0.0-dev"), "v16")
		self.assertIsNone(compat.adapter_key("15.80.0"))
		self.assertIsNone(compat.adapter_key("17.0.0"))
		self.assertIsNone(compat.adapter_key("garbage"))

	def test_unsupported_version_disables_adapter(self):
		with patch("erpnext_ui.core.compat.frappe.__version__", "17.0.0"):
			config = build_config()
		self.assertIsNone(config["adapter"])

	def test_status_reports_versions(self):
		status = compat.status()
		self.assertEqual(status["versions"]["frappe"], frappe.__version__)
		self.assertTrue(status["supported"])
