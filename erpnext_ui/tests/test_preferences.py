import json

import frappe
from frappe.model.utils.user_settings import save as frappe_user_settings_save

from erpnext_ui.api import preferences as api
from erpnext_ui.core import preferences
from erpnext_ui.core.preferences import USER_SETTINGS_KEY
from erpnext_ui.tests.fixtures import USER_A, USER_B, UITestCase, clear_runtime_state


def stored_row(user):
	rows = frappe.db.sql(
		"select data from `__UserSettings` where user=%s and doctype=%s", (user, USER_SETTINGS_KEY)
	)
	data = rows[0][0] if rows else None
	return json.loads(data) if data else None


class TestPreferenceRetrieval(UITestCase):
	def test_defaults_apply_without_preferences(self):
		frappe.set_user(USER_A)
		config = api.get_preferences()
		# The site default experience (Classic Business) supplies the themes.
		self.assertEqual(config["experience"]["key"], "classic-business")
		self.assertEqual(config["light_theme"], "Corporate Blue")
		self.assertEqual(config["dark_theme"], "Corporate Blue Dark")
		self.assertEqual(config["density"], "Comfortable")
		self.assertEqual(config["font"], "Inter")
		self.assertEqual(config["saved"], {})

	def test_guest_is_rejected(self):
		frappe.set_user("Guest")
		self.assertRaises(frappe.PermissionError, api.get_preferences)
		self.assertRaises(frappe.PermissionError, api.save_preferences, density="Compact")


class TestPreferenceUpdates(UITestCase):
	def test_save_valid_preferences(self):
		frappe.set_user(USER_A)
		config = api.save_preferences(
			light_theme="Slate Professional",
			dark_theme="Corporate Blue Dark",
			density="Compact",
			font="System UI",
		)
		self.assertEqual(config["light_theme"], "Slate Professional")
		self.assertEqual(config["dark_theme"], "Corporate Blue Dark")
		self.assertEqual(config["density"], "Compact")
		self.assertEqual(config["font_key"], "system")

	def test_saved_preferences_survive_cache_loss(self):
		frappe.set_user(USER_A)
		api.save_preferences(light_theme="Executive Green")
		self.assertEqual(stored_row(USER_A), {"overrides": {"classic-business": {"light_theme": "Executive Green"}}})
		clear_runtime_state()  # e.g. Redis flushed
		frappe.set_user(USER_A)
		self.assertEqual(api.get_preferences()["light_theme"], "Executive Green")

	def test_partial_update_merges(self):
		frappe.set_user(USER_A)
		api.save_preferences(light_theme="Executive Green")
		config = api.save_preferences(density="Spacious")
		self.assertEqual((config["light_theme"], config["density"]), ("Executive Green", "Spacious"))

	def test_invalid_values_rejected(self):
		frappe.set_user(USER_A)
		cases = [
			{"light_theme": "Does Not Exist"},
			{"light_theme": "Graphite Dark"},  # wrong mode
			{"dark_theme": "Corporate Blue"},
			{"density": "Tiny"},
			{"font": "Comic Sans"},
			{"appearance": "Sepia"},
		]
		for case in cases:
			with self.subTest(case=case):
				self.assertRaises(frappe.ValidationError, api.save_preferences, **case)
		self.assertEqual(preferences.get_saved(), {})

	def test_disabled_theme_rejected(self):
		frappe.get_doc("UI Theme", "Executive Green").update({"enabled": 0}).save()
		frappe.set_user(USER_A)
		self.assertRaises(frappe.ValidationError, api.save_preferences, light_theme="Executive Green")

	def test_appearance_uses_frappe_desk_theme(self):
		frappe.set_user(USER_A)
		config = api.save_preferences(appearance="Dark")
		self.assertEqual(config["appearance"], "Dark")
		self.assertEqual(config["appearance_source"], "user")
		self.assertEqual(frappe.db.get_value("User", USER_A, "desk_theme"), "Dark")

	def test_reset_restores_defaults(self):
		frappe.set_user(USER_A)
		api.save_preferences(light_theme="Executive Green", appearance="Dark", density="Compact")
		config = api.reset_preferences()
		self.assertEqual(config["light_theme"], "Corporate Blue")
		self.assertEqual(config["appearance_source"], "default")
		self.assertIsNone(frappe.db.get_value("User", USER_A, "desk_theme"))
		self.assertEqual(stored_row(USER_A), {})


class TestUserIsolation(UITestCase):
	def test_users_do_not_see_each_others_preferences(self):
		frappe.set_user(USER_A)
		api.save_preferences(light_theme="Executive Green", appearance="Dark")
		frappe.set_user(USER_B)
		config = api.get_preferences()
		self.assertEqual(config["light_theme"], "Corporate Blue")
		self.assertEqual(config["appearance"], "Light")
		api.save_preferences(light_theme="Warm Classic")
		frappe.set_user(USER_A)
		self.assertEqual(api.get_preferences()["light_theme"], "Executive Green")

	def test_api_has_no_user_parameter(self):
		frappe.set_user(USER_B)
		with self.assertRaises(TypeError):
			api.save_preferences(user=USER_A, light_theme="Executive Green")
		self.assertIsNone(stored_row(USER_A))

	def test_preferences_do_not_grant_permissions(self):
		frappe.set_user(USER_A)
		before = set(frappe.get_roles(USER_A))
		api.save_preferences(light_theme="Executive Green", density="Compact")
		self.assertEqual(set(frappe.get_roles(USER_A)), before)
		self.assertFalse(frappe.has_permission("UI Experience Settings", "write"))


class TestTamperedAndStalePreferences(UITestCase):
	def test_generic_user_settings_api_cannot_inject_values(self):
		frappe.set_user(USER_A)
		frappe_user_settings_save(
			USER_SETTINGS_KEY,
			json.dumps({"density": "Huge", "font": "x", "light_theme": 42, "is_admin": 1, "css": "body{}"}),
		)
		self.assertEqual(preferences.get_saved(), {})
		self.assertEqual(api.get_preferences()["density"], "Comfortable")

	def test_saved_theme_later_disabled_falls_back(self):
		frappe.set_user(USER_A)
		api.save_preferences(light_theme="Executive Green")
		frappe.set_user("Administrator")
		frappe.get_doc("UI Theme", "Executive Green").update({"enabled": 0}).save()
		frappe.set_user(USER_A)
		self.assertEqual(api.get_preferences()["light_theme"], "Corporate Blue")

	def test_corrupt_store_is_ignored(self):
		self.assertEqual(preferences.sanitise("not json"), {})
		self.assertEqual(preferences.sanitise("[1, 2]"), {})
		self.assertEqual(
			preferences.sanitise({"experience": "modern-business", "density": "Compact", "x": 1}),
			{"experience": "modern-business"},
		)
		self.assertEqual(
			preferences.sanitise({"overrides": {"modern-business": {"density": "Compact", "css": "x"}, "BAD KEY": {}}}),
			{"overrides": {"modern-business": {"density": "Compact"}}},
		)


class TestUserSelectionPolicy(UITestCase):
	def test_disallowed_selection_blocks_theme_but_not_appearance(self):
		frappe.set_user(USER_A)
		api.save_preferences(light_theme="Executive Green")
		frappe.set_user("Administrator")
		self.set_setting(allow_user_selection=0)
		frappe.set_user(USER_A)
		self.assertRaises(frappe.PermissionError, api.save_preferences, light_theme="Warm Classic")
		config = api.save_preferences(appearance="Automatic")
		self.assertEqual(config["appearance"], "Automatic")
		# Earlier personal choices are ignored while selection is disallowed:
		# the experience's own theme is shown.
		self.assertEqual(config["light_theme"], "Corporate Blue")
		self.assertEqual(config["saved"], {})

	def test_disabled_app_rejects_saves(self):
		self.set_setting(enabled=0)
		frappe.set_user(USER_A)
		self.assertRaises(frappe.ValidationError, api.save_preferences, density="Compact")
