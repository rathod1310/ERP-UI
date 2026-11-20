import frappe

from erpnext_ui.api import settings as api
from erpnext_ui.api import theme as theme_api
from erpnext_ui.core.settings import DEFAULTS, SETTINGS_DOCTYPE, get_settings
from erpnext_ui.install import ensure_settings
from erpnext_ui.tests.fixtures import MANAGER, USER_A, UITestCase


class TestGlobalSettings(UITestCase):
	def test_settings_created_with_defaults(self):
		doc = frappe.get_doc(SETTINGS_DOCTYPE)
		for key in ("enabled", "allow_user_selection", "default_appearance", "default_light_theme"):
			self.assertEqual(str(doc.get(key)), str(DEFAULTS[key]), key)

	def test_invalid_stored_values_fall_back(self):
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "default_density", "Gigantic")
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "accent_color", "javascript:alert(1)")
		frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)
		settings = get_settings()
		self.assertEqual(settings.default_density, "Comfortable")
		self.assertIsNone(settings.accent_color)

	def test_valid_update(self):
		self.set_setting(
			default_light_theme="Executive Green", default_appearance="Automatic", accent_color="#1B4F72"
		)
		settings = get_settings()
		self.assertEqual(settings.default_light_theme, "Executive Green")
		self.assertEqual(settings.accent_color, "#1b4f72")

	def test_wrong_mode_default_rejected(self):
		self.assertRaises(frappe.ValidationError, self.set_setting, default_light_theme="Graphite Dark")
		self.assertRaises(frappe.ValidationError, self.set_setting, default_dark_theme="Executive Green")

	def test_disabled_default_rejected(self):
		frappe.get_doc("UI Theme", "Warm Classic").update({"enabled": 0}).save()
		self.assertRaises(frappe.ValidationError, self.set_setting, default_light_theme="Warm Classic")

	def test_invalid_accent_rejected(self):
		self.assertRaises(frappe.ValidationError, self.set_setting, accent_color="red")

	def test_ensure_settings_keeps_admin_choice(self):
		self.set_setting(default_light_theme="Executive Green", allow_user_selection=0)
		ensure_settings()
		doc = frappe.get_doc(SETTINGS_DOCTYPE)
		self.assertEqual((doc.default_light_theme, doc.allow_user_selection), ("Executive Green", 0))


class TestAdministratorApis(UITestCase):
	def test_manager_can_publish_defaults(self):
		frappe.set_user(MANAGER)
		config = api.publish_defaults(experience="modern-business", light_theme="Slate Professional", appearance="Dark")
		self.assertEqual(config["defaults"]["light_theme"], "Slate Professional")  # fallback theme
		self.assertEqual(config["experience"]["key"], "modern-business")
		doc = frappe.get_doc(SETTINGS_DOCTYPE)
		self.assertEqual((doc.default_experience, doc.default_appearance), ("modern-business", "Dark"))

	def test_publish_validates(self):
		frappe.set_user(MANAGER)
		self.assertRaises(frappe.ValidationError, api.publish_defaults, light_theme="Graphite Dark")

	def test_manager_can_reset(self):
		self.set_setting(default_light_theme="Executive Green", enabled=0, accent_color="#123456")
		frappe.set_user(MANAGER)
		api.reset_settings()
		settings = get_settings()
		self.assertEqual(settings.default_light_theme, "Corporate Blue")
		self.assertEqual(settings.enabled, 1)
		self.assertIsNone(settings.accent_color)

	def test_regular_user_cannot_change_global_settings(self):
		frappe.set_user(USER_A)
		self.assertRaises(frappe.PermissionError, api.publish_defaults, light_theme="Executive Green")
		self.assertRaises(frappe.PermissionError, api.reset_settings)
		self.assertRaises(frappe.PermissionError, api.get_status)
		self.assertRaises(frappe.PermissionError, theme_api.preview_catalog, accent_color="#123456")
		doc = frappe.get_doc(SETTINGS_DOCTYPE)
		doc.default_light_theme = "Executive Green"
		self.assertRaises(frappe.PermissionError, doc.save)
		frappe.set_user("Administrator")
		self.assertEqual(get_settings().default_light_theme, "Corporate Blue")

	def test_preview_catalog_does_not_store(self):
		frappe.set_user(MANAGER)
		catalog = theme_api.preview_catalog(accent_color="#0b3d91")
		self.assertEqual(catalog[0]["tokens"]["primary"], "#0b3d91")
		self.assertIsNone(get_settings().accent_color)
		self.assertRaises(frappe.ValidationError, theme_api.preview_catalog, accent_color="nope")
