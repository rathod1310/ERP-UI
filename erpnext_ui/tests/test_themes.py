import frappe

from erpnext_ui.core import themes
from erpnext_ui.install import sync_standard_themes
from erpnext_ui.tests.fixtures import UITestCase
from erpnext_ui.theme.presets import LEGACY_SUCCESSORS, PRESETS


class TestThemeCatalog(UITestCase):
	def test_standard_presets_installed(self):
		rows = frappe.get_all(
			"UI Theme", filters={"is_standard": 1, "enabled": 1}, fields=["name", "mode", "theme_key"]
		)
		self.assertEqual({r.name for r in rows}, set(PRESETS))
		# The Phase 1 presets stay as disabled standard records (v0_4).
		legacy = frappe.get_all("UI Theme", filters={"is_standard": 1, "enabled": 0}, pluck="name")
		self.assertTrue(set(LEGACY_SUCCESSORS) <= set(legacy))
		self.assertEqual({r.name: r.theme_key for r in rows}["Slate Professional"], "slate-professional")

	def test_catalog_entries_are_complete(self):
		catalog = themes.get_catalog()
		self.assertEqual([t["name"] for t in catalog], list(PRESETS))
		for theme in catalog:
			self.assertIn("primary", theme["tokens"])
			self.assertEqual(theme["tokens"]["color-scheme"], theme["mode"].lower())

	def test_disabled_theme_left_out_of_catalog(self):
		doc = frappe.get_doc("UI Theme", "Executive Green")
		doc.enabled = 0
		doc.save()
		self.assertNotIn("Executive Green", [t["name"] for t in themes.get_catalog()])

	def test_pick_falls_back(self):
		catalog = themes.get_catalog()
		self.assertEqual(themes.pick(catalog, "Light", "Missing", None)["name"], "Corporate Blue")
		self.assertEqual(themes.pick(catalog, "Dark", "Slate Professional")["name"], "Graphite Dark")
		self.assertEqual(themes.pick(catalog, "Dark", "Corporate Blue Dark")["name"], "Corporate Blue Dark")

	def test_accent_applied_to_catalog(self):
		catalog = themes.get_catalog("#0b3d91")
		light = themes.find(catalog, "Corporate Blue", "Light")
		self.assertEqual(light["tokens"]["primary"], "#0b3d91")


class TestStandardPresetProtection(UITestCase):
	def test_colours_cannot_be_edited(self):
		doc = frappe.get_doc("UI Theme", "Corporate Blue")
		doc.primary = "#ff0000"
		self.assertRaises(frappe.ValidationError, doc.save)

	def test_enabled_and_sort_order_can_change(self):
		doc = frappe.get_doc("UI Theme", "Warm Classic")
		doc.enabled = 0
		doc.sort_order = 99
		doc.save()
		self.assertEqual(frappe.db.get_value("UI Theme", "Warm Classic", "sort_order"), 99)

	def test_fallbacks_cannot_be_disabled(self):
		for name in ("Corporate Blue", "Graphite Dark"):
			doc = frappe.get_doc("UI Theme", name)
			doc.enabled = 0
			self.assertRaises(frappe.ValidationError, doc.save)

	def test_standard_cannot_be_deleted(self):
		self.assertRaises(frappe.ValidationError, frappe.delete_doc, "UI Theme", "Executive Green")

	def test_site_default_cannot_be_disabled(self):
		self.set_setting(default_light_theme="Slate Professional")
		doc = frappe.get_doc("UI Theme", "Slate Professional")
		doc.enabled = 0
		self.assertRaises(frappe.ValidationError, doc.save)

	def test_new_standard_theme_rejected(self):
		doc = frappe.get_doc(
			{"doctype": "UI Theme", "theme_name": "Fake Standard", "mode": "Light", "is_standard": 1}
		)
		self.assertRaises(frappe.ValidationError, doc.insert)

	def test_sync_is_idempotent_and_keeps_admin_choices(self):
		doc = frappe.get_doc("UI Theme", "Executive Green")
		doc.enabled = 0
		doc.sort_order = 77
		doc.save()
		sync_standard_themes()
		sync_standard_themes()
		self.assertEqual(
			frappe.db.count("UI Theme", {"is_standard": 1, "name": ["in", list(PRESETS)]}), len(PRESETS)
		)
		row = frappe.db.get_value(
			"UI Theme", "Executive Green", ["enabled", "sort_order", "primary"], as_dict=True
		)
		self.assertEqual((row.enabled, row.sort_order), (0, 77))
		self.assertEqual(row.primary, PRESETS["Executive Green"]["colours"]["primary"])


class TestCustomThemes(UITestCase):
	def test_based_on_inherits_and_overrides(self):
		self.custom_theme(primary="#1b4f72")
		theme = themes.find(themes.get_catalog(), "Test Custom Light", "Light")
		self.assertEqual(theme["tokens"]["primary"], "#1b4f72")
		self.assertEqual(theme["tokens"]["surface"], PRESETS["Corporate Blue"]["colours"]["surface"])
		self.assertEqual(theme["key"], "test-custom-light")

	def test_invalid_colour_rejected(self):
		self.assertRaises(frappe.ValidationError, self.custom_theme, primary="#12")

	def test_poor_contrast_rejected(self):
		self.assertRaises(frappe.ValidationError, self.custom_theme, text="#dddddd")

	def test_based_on_must_match_mode(self):
		self.assertRaises(frappe.ValidationError, self.custom_theme, mode="Dark", based_on="Corporate Blue")

	def test_radius_range_enforced(self):
		self.assertRaises(frappe.ValidationError, self.custom_theme, corner_radius=30)

	def test_custom_theme_can_be_deleted(self):
		self.custom_theme()
		frappe.delete_doc("UI Theme", "Test Custom Light")
		self.assertFalse(frappe.db.exists("UI Theme", "Test Custom Light"))

	def test_catalog_cache_refreshes_on_change(self):
		themes.get_catalog()
		self.custom_theme()
		self.assertIn("Test Custom Light", [t["name"] for t in themes.get_catalog()])

	def test_only_managers_can_write_themes(self):
		from erpnext_ui.tests.fixtures import USER_A

		frappe.set_user(USER_A)
		doc = frappe.get_doc({"doctype": "UI Theme", "theme_name": "Sneaky", "mode": "Light"})
		self.assertRaises(frappe.PermissionError, doc.insert)
