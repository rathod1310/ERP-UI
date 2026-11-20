"""Phase 3 M2: the theme collection in the database, the custom colour engine
APIs, backdrop settings and the v0_4 migration from the Phase 1 presets."""

import json

import frappe

from erpnext_ui.api import theme as theme_api
from erpnext_ui.core import preferences, themes
from erpnext_ui.core.config import build_config
from erpnext_ui.core.settings import SETTINGS_DOCTYPE, get_settings
from erpnext_ui.install import sync_standard_themes
from erpnext_ui.patches.v0_4 import theme_collection
from erpnext_ui.patches.v0_5 import experience_packs
from erpnext_ui.tests.fixtures import MANAGER, USER_A, UITestCase
from erpnext_ui.theme import colour
from erpnext_ui.theme.presets import LEGACY_SUCCESSORS, PRESETS
from erpnext_ui.theme.tokens import RECIPES


class TestCollectionCatalog(UITestCase):
	def test_catalog_lists_the_collection_with_recipes(self):
		catalog = themes.build_catalog()
		names = [t["name"] for t in catalog]
		for name in PRESETS:
			self.assertIn(name, names)
		for legacy in LEGACY_SUCCESSORS:
			self.assertNotIn(legacy, names, "Phase 1 presets are disabled")
		corporate = next(t for t in catalog if t["name"] == "Corporate Blue")
		self.assertEqual(
			corporate["recipe"],
			{
				"sidebar": "gradient",
				"navbar": "solid",
				"surface": "bordered",
				"input": "outlined",
				"table": "lined",
				"button": "rounded",
				"backdrop": "geometric",
				"heading": "body",
				"numerals": "proportional",
			},
		)
		self.assertIn("sidebar-active-text", corporate["tokens"])

	def test_sync_stores_recipes_on_standard_records(self):
		sync_standard_themes()
		row = frappe.db.get_value("UI Theme", "Warm Classic", list(RECIPES), as_dict=True)
		self.assertEqual(dict(row), PRESETS["Warm Classic"]["recipe"])

	def test_standard_recipe_is_protected(self):
		doc = frappe.get_doc("UI Theme", "Corporate Blue")
		doc.backdrop = "None"
		self.assertRaises(frappe.ValidationError, doc.save)

	def test_custom_theme_based_on_a_legacy_preset_still_resolves(self):
		"""Custom themes made from Phase 1 presets keep working after migration."""
		frappe.db.set_value("UI Theme", "Classic Light", "enabled", 1)
		doc = self.custom_theme("Old Custom", based_on="Classic Light", primary="#225588")
		frappe.db.set_value("UI Theme", "Classic Light", "enabled", 0)
		themes.clear_cache()
		entry = next(t for t in themes.build_catalog() if t["name"] == doc.name)
		self.assertEqual(entry["recipe"]["sidebar"], "attached")
		tokens = entry["tokens"]
		self.assertGreaterEqual(colour.contrast_ratio(tokens["sidebar-text"], tokens["sidebar-bg"]), 4.5)


class TestBackdropSettings(UITestCase):
	def test_payload_carries_backdrop_switches(self):
		frappe.set_user(USER_A)
		self.assertEqual(build_config()["backdrops"], {"enabled": 1, "through_panels": 0})

	def test_backdrops_can_be_switched_off(self):
		self.set_setting(enable_backdrops=0, backdrop_through_panels=1)
		self.assertEqual(build_config()["backdrops"], {"enabled": 0, "through_panels": 1})


class TestColourEngineApi(UITestCase):
	def test_generate_returns_a_previewable_theme_and_stores_nothing(self):
		frappe.set_user(MANAGER)
		before = frappe.db.count("UI Theme")
		result = theme_api.generate_theme("#2b5d8f", "#c0782d", "Dark", "Strong")
		self.assertEqual(result["theme"]["mode"], "Dark")
		self.assertTrue(all(row["ok"] for row in result["contrast"]))
		self.assertEqual(result["theme"]["recipe"]["backdrop"], "gradient")
		self.assertEqual(frappe.db.count("UI Theme"), before)

	def test_create_custom_theme(self):
		frappe.set_user(MANAGER)
		name = theme_api.create_custom_theme("Arjun Brand", "#7a1f4b", "#d18b2c", "Light", "Strong")
		doc = frappe.get_doc("UI Theme", name)
		self.assertEqual((doc.mode, doc.is_standard, doc.sidebar_style), ("Light", 0, "Attached Gradient"))
		self.assertIn(name, [t["name"] for t in themes.build_catalog()])

	def test_invalid_colours_refused(self):
		frappe.set_user(MANAGER)
		self.assertRaises(frappe.ValidationError, theme_api.generate_theme, "red", "#000000")
		self.assertRaises(frappe.ValidationError, theme_api.generate_theme, "#123456", "#000000", "Neon")

	def test_regular_user_cannot_generate_or_create(self):
		frappe.set_user(USER_A)
		self.assertRaises(frappe.PermissionError, theme_api.generate_theme, "#2b5d8f", "#c0782d")
		self.assertRaises(
			frappe.PermissionError, theme_api.create_custom_theme, "X", "#2b5d8f", "#c0782d"
		)


class TestThemeCollectionPatch(UITestCase):
	def _legacy_site(self):
		"""A Phase 2 site: legacy presets enabled and used by the site and a user."""
		for name in LEGACY_SUCCESSORS:
			frappe.db.set_value("UI Theme", name, "enabled", 1)
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "default_light_theme", "Soft Green")
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "default_dark_theme", "Professional Dark")
		frappe.set_user(USER_A)
		preferences._persist({"light_theme": "Neutral Grey", "dark_theme": "Classic Dark", "density": "Compact"})
		frappe.set_user("Administrator")
		frappe.db.sql(
			"delete from `tabSingles` where doctype = %s and field in ('enable_backdrops', 'backdrop_through_panels')",
			(SETTINGS_DOCTYPE,),
		)
		frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)

	def test_moves_site_defaults_users_and_disables_legacy_presets(self):
		self._legacy_site()
		theme_collection.execute()
		settings = get_settings()
		self.assertEqual(
			(settings.default_light_theme, settings.default_dark_theme), ("Executive Green", "Graphite Dark")
		)
		self.assertEqual((settings.enable_backdrops, settings.backdrop_through_panels), (1, 0))
		row = frappe.db.sql(
			"select data from `__UserSettings` where user = %s and doctype = %s",
			(USER_A, preferences.USER_SETTINGS_KEY),
		)[0][0]
		self.assertEqual(
			json.loads(row), {"light_theme": "Slate Professional", "dark_theme": "Graphite Dark", "density": "Compact"}
		)
		for name in LEGACY_SUCCESSORS:
			self.assertEqual(frappe.db.get_value("UI Theme", name, "enabled"), 0, name)
		# M3 then turns the saved theme into an adjustment of the site's experience.
		experience_packs.execute()
		frappe.set_user(USER_A)
		self.assertEqual(build_config()["light_theme"], "Slate Professional")

	def test_patch_is_idempotent_and_keeps_new_choices(self):
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "default_light_theme", "Warm Classic")
		self.set_setting(enable_backdrops=0)
		theme_collection.execute()
		theme_collection.execute()
		settings = get_settings()
		self.assertEqual((settings.default_light_theme, settings.enable_backdrops), ("Warm Classic", 0))
