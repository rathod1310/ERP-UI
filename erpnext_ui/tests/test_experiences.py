"""Phase 3 M3: Experience Packs.

Pure registry and resolution tests, the UI Experience records, the
preference and administrator APIs with their permission rules, the per-user
home page, the home page data (permission-aware) and the v0_5 upgrade patch.
"""

import json
import unittest

import frappe
from frappe.model.utils.user_settings import save as frappe_user_settings_save

from erpnext_ui import boot
from erpnext_ui.api import home as home_api
from erpnext_ui.api import preferences as api
from erpnext_ui.api import settings as settings_api
from erpnext_ui.core import experience, home_data, preferences
from erpnext_ui.core.config import build_config
from erpnext_ui.core.settings import SETTINGS_DOCTYPE
from erpnext_ui.experience import packs, resolve
from erpnext_ui.patches.v0_5 import experience_packs as patch
from erpnext_ui.tests.fixtures import MANAGER, USER_A, USER_B, UITestCase
from erpnext_ui.theme import layouts
from erpnext_ui.theme.presets import PRESETS


def stored(user):
	rows = frappe.db.sql(
		"select data from `__UserSettings` where user=%s and doctype=%s", (user, preferences.USER_SETTINGS_KEY)
	)
	return json.loads(rows[0][0]) if rows and rows[0][0] else None


def patch_home_ready(value):
	from unittest.mock import patch as mock_patch

	return mock_patch("erpnext_ui.core.experience.home_page_ready", return_value=value)


def pack(key):
	return resolve.normalise_pack(key, packs.PACKS[key])


class TestPackRegistry(unittest.TestCase):
	def test_seven_packs_in_order(self):
		self.assertEqual(
			list(packs.PACKS),
			[
				"signature-enterprise",
				"classic-business",
				"modern-business",
				"application-hub",
				"executive-suite",
				"department-workspace",
				"minimal-professional",
			],
		)
		self.assertIn(packs.DEFAULT_EXPERIENCE, packs.PACKS)

	def test_every_pack_is_complete_and_valid(self):
		for key, definition in packs.PACKS.items():
			with self.subTest(pack=key):
				self.assertTrue(resolve.is_key(key))
				self.assertEqual(PRESETS[definition["light_theme"]]["mode"], "Light")
				self.assertEqual(PRESETS[definition["dark_theme"]]["mode"], "Dark")
				for name in definition["compatible_themes"]:
					self.assertIn(name, PRESETS)
				self.assertEqual(set(definition["shell"]), set(packs.COMPONENTS))
				for component, variant in definition["shell"].items():
					self.assertIn(variant, packs.COMPONENTS[component])
				for category, value in definition["layout"].items():
					self.assertTrue(layouts.is_valid(category, value), (category, value))
				self.assertEqual(pack(key)["shell"], definition["shell"])

	def test_packs_are_structures_not_recolours(self):
		"""No two packs share a home, a navigation or a form design."""
		for component in ("home", "nav", "header", "form", "list"):
			values = [p["shell"][component] for p in packs.PACKS.values()]
			self.assertEqual(len(values), len(set(values)), component)

	def test_every_pack_has_its_own_home(self):
		"""On v16 the native home is the Desktop app grid; every pack would share it."""
		self.assertTrue(all(pack(k)["custom_home"] for k in packs.PACKS))
		self.assertEqual(set(packs.CUSTOM_HOMES), set(packs.COMPONENTS["home"]))

	def test_normalise_repairs_bad_values(self):
		p = resolve.normalise_pack("x-1", {"shell": {"nav": "evil<script>", "home": "hub"}, "layout": {"navigation": "Huge"}, "density": "Tiny"})
		self.assertEqual(p["shell"]["nav"], packs.COMPONENTS["nav"][0])
		self.assertEqual(p["shell"]["home"], "hub")
		self.assertEqual(p["layout"]["navigation"], "Standard")
		self.assertEqual(p["density"], "Comfortable")

	def test_keys(self):
		for good in ("classic-business", "a1", "x"):
			self.assertTrue(resolve.is_key(good))
		for bad in ("", "Classic", "a b", "a_b", "-a", "x" * 65, None, 3):
			self.assertFalse(resolve.is_key(bad), bad)

	def test_departments_are_well_formed(self):
		keys = [d["key"] for d in packs.DEPARTMENTS]
		self.assertEqual(len(keys), len(set(keys)))
		self.assertEqual(
			set(keys), {"sales", "purchase", "accounts", "stock", "manufacturing", "quality", "hr", "projects", "crm"}
		)
		for d in packs.DEPARTMENTS:
			for _label, doctype, filters in d["counts"]:
				self.assertIsInstance(filters, dict)
				self.assertTrue(doctype)


class TestResolution(unittest.TestCase):
	catalog = {k: pack(k) for k in packs.PACKS}

	def test_choose(self):
		c = self.catalog
		self.assertEqual(resolve.choose(c, site_default="modern-business", user_choice="application-hub", allowed=None, user_may_choose=True), ("application-hub", "user"))
		self.assertEqual(resolve.choose(c, site_default="modern-business", user_choice="application-hub", allowed=None, user_may_choose=False), ("modern-business", "site"))
		self.assertEqual(resolve.choose(c, site_default="modern-business", user_choice="application-hub", allowed=["executive-suite"], user_may_choose=True), ("modern-business", "site"))
		self.assertEqual(resolve.choose(c, site_default="gone", user_choice="gone-too", allowed=None, user_may_choose=True), (packs.DEFAULT_EXPERIENCE, "fallback"))
		self.assertEqual(resolve.choose({}, site_default=None, user_choice=None, allowed=None, user_may_choose=True), (None, "none"))

	def test_available_always_includes_site_default(self):
		self.assertEqual(resolve.available(self.catalog, ["executive-suite"], "classic-business"), ["classic-business", "executive-suite"])
		self.assertEqual(len(resolve.available(self.catalog, [], "classic-business")), 7)

	def test_apply_respects_open_groups(self):
		p = self.catalog["modern-business"]
		overrides = {"light_theme": "Corporate Blue", "navigation": "Compact", "density": "Compact"}
		open_all = {"navigation": True, "workspace": True, "forms": True, "lists": True, "content": True}
		r = resolve.apply(p, overrides, theme_open=True, layout_open=open_all)
		self.assertEqual((r["selection"]["light_theme"], r["layout"]["navigation"], r["selection"]["density"]), ("Corporate Blue", "Compact", "Compact"))
		r = resolve.apply(p, overrides, theme_open=False, layout_open={})
		self.assertEqual((r["selection"]["light_theme"], r["layout"]["navigation"]), ("Modern Office", "Standard"))
		self.assertEqual(set(r["sources"].values()), {"pack"})

	def test_diff_keeps_only_real_adjustments(self):
		p = self.catalog["classic-business"]
		self.assertEqual(
			resolve.diff_overrides(p, {"light_theme": "Corporate Blue", "dark_theme": "Graphite Dark", "navigation": "Standard", "font": "Bogus"}),
			{"dark_theme": "Graphite Dark"},
		)

	def test_clean_overrides(self):
		self.assertEqual(
			resolve.clean_overrides({"modern-business": {"density": "Compact", "x": 1}, "Bad": {"density": "Compact"}, "a": "no"}),
			{"modern-business": {"density": "Compact"}},
		)


class TestExperienceRecords(UITestCase):
	def test_standard_packs_are_synced(self):
		names = frappe.get_all("UI Experience", filters={"is_standard": 1}, pluck="name", order_by="sort_order asc")
		self.assertEqual(names, list(packs.PACKS))
		doc = frappe.get_doc("UI Experience", "executive-suite")
		self.assertEqual((doc.light_theme, doc.dark_theme, doc.shell_home), ("Executive Green", "Graphite Dark", "overview"))
		self.assertIn("Total Stock Value", doc.home_cards)

	def test_standard_pack_is_protected(self):
		doc = frappe.get_doc("UI Experience", "modern-business")
		doc.shell_home = "hub"
		self.assertRaises(frappe.ValidationError, doc.save)
		doc.reload()
		doc.sort_order = 99
		doc.save()  # order and enabled stay editable
		self.assertRaises(frappe.ValidationError, frappe.delete_doc, "UI Experience", "modern-business")

	def test_fallback_and_default_cannot_be_disabled(self):
		doc = frappe.get_doc("UI Experience", packs.DEFAULT_EXPERIENCE)
		doc.enabled = 0
		self.assertRaises(frappe.ValidationError, doc.save)
		self.set_setting(default_experience="application-hub")
		doc = frappe.get_doc("UI Experience", "application-hub")
		doc.enabled = 0
		self.assertRaises(frappe.ValidationError, doc.save)

	def test_custom_pack_from_existing_variants(self):
		values = experience.definition_to_values(pack("application-hub"))
		values.update({"experience_name": "Our Hub", "experience_key": "our-hub", "shell_form": "facts"})
		frappe.get_doc({"doctype": "UI Experience", **values}).insert()
		frappe.set_user(USER_A)
		keys = [a["key"] for a in build_config()["experience"]["available"]]
		self.assertIn("our-hub", keys)
		config = api.save_preferences(experience="our-hub")
		self.assertEqual(config["experience"]["shell"]["form"], "facts")

	def test_wrong_mode_theme_refused(self):
		values = experience.definition_to_values(pack("application-hub"))
		values.update({"experience_name": "Broken", "experience_key": "broken", "light_theme": "Graphite Dark"})
		self.assertRaises(frappe.ValidationError, frappe.get_doc({"doctype": "UI Experience", **values}).insert)

	def test_disabling_a_chosen_pack_falls_back(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="application-hub")
		frappe.set_user("Administrator")
		frappe.get_doc("UI Experience", "application-hub").update({"enabled": 0}).save()
		frappe.set_user(USER_A)
		self.assertEqual(build_config()["experience"]["key"], "classic-business")


class TestExperiencePreferences(UITestCase):
	def test_site_default_without_choice(self):
		frappe.set_user(USER_A)
		config = build_config()
		self.assertEqual((config["experience"]["key"], config["experience"]["source"]), ("classic-business", "site"))
		self.assertEqual(config["experience"]["shell"]["home"], "workspace")
		self.assertEqual(len(config["experience"]["available"]), 7)

	def test_choose_an_experience_changes_everything(self):
		frappe.set_user(USER_A)
		config = api.save_preferences(experience="minimal-professional")
		self.assertEqual(config["experience"]["key"], "minimal-professional")
		self.assertEqual((config["light_theme"], config["dark_theme"]), ("Mono Ink", "Mono Ink Dark"))
		self.assertEqual((config["density"], config["font"]), ("Compact", "System UI"))
		self.assertEqual(config["layout"]["values"]["navigation"], "Collapsed")
		self.assertEqual(config["layout"]["attributes"]["card_style"], "minimal")
		self.assertEqual(stored(USER_A), {"experience": "minimal-professional"})

	def test_adjustments_are_stored_per_pack_as_differences(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="modern-business", light_theme="Corporate Blue", density="Comfortable")
		self.assertEqual(stored(USER_A)["overrides"], {"modern-business": {"light_theme": "Corporate Blue"}})
		api.save_preferences(experience="executive-suite", navigation="Compact")
		self.assertEqual(
			stored(USER_A)["overrides"],
			{"modern-business": {"light_theme": "Corporate Blue"}, "executive-suite": {"navigation": "Compact"}},
		)
		# Back to the first pack: its adjustment is still there.
		config = api.save_preferences(experience="modern-business")
		self.assertEqual(config["light_theme"], "Corporate Blue")
		self.assertEqual(config["layout"]["values"]["navigation"], "Standard")
		entry = next(a for a in config["experience"]["available"] if a["key"] == "modern-business")
		self.assertEqual(entry["overridden"], ["light_theme"])

	def test_empty_string_returns_to_the_pack_value(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="modern-business", density="Compact", font="System UI")
		api.save_preferences(density="")
		self.assertEqual(stored(USER_A)["overrides"], {"modern-business": {"font": "System UI"}})

	def test_restore_clears_one_pack_only(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="executive-suite", navigation="Compact")
		api.save_preferences(experience="modern-business", density="Compact")
		config = api.restore_experience()
		self.assertEqual(config["density"], "Comfortable")
		self.assertEqual(stored(USER_A)["overrides"], {"executive-suite": {"navigation": "Compact"}})
		api.restore_experience(experience="executive-suite")
		self.assertNotIn("overrides", stored(USER_A))

	def test_reset_forgets_choice_and_adjustments(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="executive-suite", navigation="Compact", appearance="Dark")
		config = api.reset_preferences()
		self.assertEqual(config["experience"]["key"], "classic-business")
		self.assertEqual(stored(USER_A), {})

	def test_invalid_values_rejected(self):
		frappe.set_user(USER_A)
		self.assertRaises(frappe.ValidationError, api.save_preferences, experience="does-not-exist")
		self.assertRaises(frappe.ValidationError, api.save_preferences, navigation="Floating")
		self.assertRaises(frappe.ValidationError, api.save_preferences, light_theme="Graphite Dark")
		self.assertRaises(frappe.ValidationError, api.save_preferences, density="Huge")
		self.assertIsNone(stored(USER_A))

	def test_closed_groups_are_refused_and_ignored(self):
		frappe.set_user(USER_A)
		api.save_preferences(navigation="Compact")
		frappe.set_user("Administrator")
		self.set_setting(allow_navigation=0)
		frappe.set_user(USER_A)
		self.assertRaises(frappe.PermissionError, api.save_preferences, navigation="Collapsed")
		self.assertEqual(build_config()["layout"]["values"]["navigation"], "Standard")
		# Other groups stay open.
		self.assertEqual(api.save_preferences(form_format="Compact")["layout"]["values"]["form_format"], "Compact")

	def test_theme_lock_keeps_the_pack_theme(self):
		self.set_setting(allow_user_selection=0)
		frappe.set_user(USER_A)
		self.assertRaises(frappe.PermissionError, api.save_preferences, light_theme="Warm Classic")
		config = api.save_preferences(experience="modern-business")  # choosing a pack is a separate switch
		self.assertEqual(config["light_theme"], "Modern Office")

	def test_experience_choice_can_be_closed(self):
		self.set_setting(allow_user_experience=0, default_experience="executive-suite")
		frappe.set_user(USER_A)
		self.assertRaises(frappe.PermissionError, api.save_preferences, experience="modern-business")
		config = build_config()
		self.assertEqual(config["experience"]["key"], "executive-suite")
		self.assertEqual([a["key"] for a in config["experience"]["available"]], ["executive-suite"])
		# Adjusting the site's experience is still possible.
		self.assertEqual(api.save_preferences(density="Compact")["density"], "Compact")

	def test_allowed_list(self):
		doc = frappe.get_doc(SETTINGS_DOCTYPE)
		doc.set("allowed_experiences", [{"experience": "executive-suite"}, {"experience": "application-hub"}])
		doc.save()
		frappe.set_user(USER_A)
		keys = [a["key"] for a in build_config()["experience"]["available"]]
		self.assertEqual(keys, ["classic-business", "application-hub", "executive-suite"])
		self.assertRaises(frappe.PermissionError, api.save_preferences, experience="modern-business")
		api.save_preferences(experience="application-hub")
		frappe.set_user("Administrator")
		doc = frappe.get_doc(SETTINGS_DOCTYPE)
		doc.set("allowed_experiences", [{"experience": "executive-suite"}])
		doc.save()
		frappe.set_user(USER_A)
		self.assertEqual(build_config()["experience"]["key"], "classic-business")
		self.assertEqual(stored(USER_A)["experience"], "application-hub")  # kept in case it returns

	def test_users_are_isolated(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="application-hub")
		frappe.set_user(USER_B)
		self.assertEqual(build_config()["experience"]["key"], "classic-business")

	def test_injected_user_settings_are_ignored(self):
		frappe.set_user(USER_A)
		frappe_user_settings_save(
			preferences.USER_SETTINGS_KEY,
			json.dumps({"experience": "Not A Key!", "overrides": {"modern-business": {"css": "body{}", "density": "x"}}, "is_admin": 1}),
		)
		self.assertEqual(preferences.get_saved(), {})
		self.assertEqual(build_config()["experience"]["key"], "classic-business")

	def test_no_user_parameter(self):
		for fn in (api.save_preferences, api.restore_experience, api.reset_preferences, home_api.get_home):
			self.assertNotIn("user", fn.__code__.co_varnames[: fn.__code__.co_argcount])


class TestSiteDefault(UITestCase):
	def test_manager_sets_the_site_default(self):
		frappe.set_user(MANAGER)
		config = settings_api.publish_defaults(experience="department-workspace")
		self.assertEqual(config["experience"]["site_default"], "department-workspace")
		frappe.set_user(USER_A)
		self.assertEqual(build_config()["experience"]["key"], "department-workspace")

	def test_regular_user_cannot(self):
		frappe.set_user(USER_A)
		self.assertRaises(frappe.PermissionError, settings_api.publish_defaults, experience="department-workspace")

	def test_unknown_experience_refused(self):
		frappe.set_user(MANAGER)
		self.assertRaises(frappe.ValidationError, settings_api.publish_defaults, experience="nope")


class TestHomePage(UITestCase):
	def _boot(self):
		bootinfo = frappe._dict(home_page="workspace")
		boot.extend_bootinfo(bootinfo)
		return bootinfo

	def test_experience_home_becomes_the_users_home(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="executive-suite")
		b = self._boot()
		self.assertEqual(b.home_page, packs.HOME_PAGE)
		self.assertEqual(b.erpnext_ui["experience"]["native_home_page"], "workspace")
		self.assertEqual(b.erpnext_ui["experience"]["shell"]["home"], "overview")
		# The site-wide default is untouched.
		self.assertNotEqual(frappe.db.get_default("desktop:home_page"), packs.HOME_PAGE)
		frappe.set_user(USER_B)  # no choice: the site default experience's home
		b = self._boot()
		self.assertEqual((b.home_page, b.erpnext_ui["experience"]["shell"]["home"]), (packs.HOME_PAGE, "workspace"))

	def test_site_without_the_home_page_keeps_the_native_home(self):
		"""A site sharing the app code but not migrated since M3 has no ui-home Page."""
		frappe.set_user(USER_A)
		api.save_preferences(experience="executive-suite")
		with patch_home_ready(False):
			b = self._boot()
		self.assertEqual(b.home_page, "workspace")
		self.assertEqual(b.erpnext_ui["experience"]["home_available"], 0)
		self.assertIsNone(b.erpnext_ui["experience"]["home_page"])

	def test_site_not_updated_refuses_to_apply(self):
		"""No false success: an experience cannot be chosen where it cannot be shown."""
		frappe.set_user(USER_A)
		with patch_home_ready(False):
			self.assertRaises(frappe.ValidationError, api.save_preferences, experience="modern-business")
			self.assertEqual(api.save_preferences(appearance="Dark")["appearance"], "Dark")  # still allowed
		frappe.set_user(MANAGER)
		with patch_home_ready(False):
			self.assertRaises(frappe.ValidationError, settings_api.publish_defaults, experience="modern-business")
		frappe.set_user(USER_A)
		self.assertNotEqual(build_config()["experience"]["key"], "modern-business")

	def test_setup_wizard_is_never_replaced(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="application-hub")
		bootinfo = frappe._dict(home_page="setup-wizard")
		boot.extend_bootinfo(bootinfo)
		self.assertEqual(bootinfo.home_page, "setup-wizard")

	def test_disabled_app_keeps_the_native_home(self):
		frappe.set_user(USER_A)
		api.save_preferences(experience="application-hub")
		frappe.set_user("Administrator")
		self.set_setting(enabled=0)
		frappe.set_user(USER_A)
		self.assertEqual(self._boot().home_page, "workspace")


class TestHomeData(UITestCase):
	def test_guests_and_bad_designs_refused(self):
		frappe.set_user("Guest")
		self.assertRaises(frappe.PermissionError, home_api.get_home, design="dashboard")
		frappe.set_user(USER_A)
		self.assertRaises(frappe.ValidationError, home_api.get_home, design="anything")

	def test_designs_return_their_sections(self):
		for design, keys in (
			("workspace", {"create", "recent"}),
			("minimal", {"create", "recent"}),
			("dashboard", {"create", "recent", "assigned"}),
			("hub", {"create", "recent"}),
			("overview", {"approvals", "overdue", "activity"}),
			("department", {"departments", "department"}),
		):
			with self.subTest(design=design):
				data = home_api.get_home(design=design, refresh=1)
				self.assertTrue(keys <= set(data), design)
				self.assertEqual(data["design"], design)

	def test_restricted_user_sees_only_what_they_can_read(self):
		frappe.set_user(USER_A)  # Report Manager only: no Selling, Buying or Accounts access
		self.assertFalse(frappe.has_permission("Sales Invoice", "read"))
		data = home_api.get_home(design="department", refresh=1)
		keys = [d["key"] for d in data["departments"]]
		for blocked in ("sales", "purchase", "accounts"):
			self.assertNotIn(blocked, keys)
		self.assertEqual(home_api.get_home(design="dashboard", refresh=1)["create"], [])
		self.assertEqual(home_api.get_home(design="overview", refresh=1)["overdue"], [])
		self.assertIsNone(home_api.get_chart(chart_name="Outgoing Bills (Sales Invoice)"))

	def test_administrator_sees_sales(self):
		data = home_api.get_home(design="department", department="sales", refresh=1)
		self.assertEqual(data["department"]["key"], "sales")
		self.assertTrue(all(isinstance(c["count"], int) for c in data["department"]["counts"]))
		chart = home_api.get_chart(chart_name="Outgoing Bills (Sales Invoice)")
		self.assertTrue(chart and chart["data"]["labels"])

	def test_unknown_department_falls_back(self):
		data = home_api.get_home(design="department", department="nope", refresh=1)
		self.assertIn(data["department"]["key"], packs.DEPARTMENT_KEYS)

	def test_cache_is_per_user(self):
		admin = home_data._cache_key("dashboard", None)
		frappe.set_user(USER_A)
		self.assertNotEqual(admin, home_data._cache_key("dashboard", None))


class TestExperiencePatch(UITestCase):
	def test_legacy_rows_become_adjustments_of_the_site_pack(self):
		frappe.set_user(USER_A)
		preferences._persist(
			{"light_theme": "Warm Classic", "dark_theme": "Corporate Blue Dark", "layout_preset": "Compact", "form_format": "Compact", "appearance": "Dark"}
		)
		frappe.set_user(USER_B)
		preferences._persist({"experience": "application-hub"})
		frappe.set_user("Administrator")
		patch.execute()
		row = stored(USER_A)
		self.assertEqual(row["overrides"], {"classic-business": {"light_theme": "Warm Classic", "form_format": "Compact"}})
		self.assertEqual(row["appearance"], "Dark")
		self.assertEqual(row["_legacy"]["layout_preset"], "Compact")
		self.assertEqual(stored(USER_B), {"experience": "application-hub"})  # already new: untouched
		patch.execute()
		self.assertEqual(stored(USER_A), row)  # idempotent
		frappe.set_user(USER_A)
		config = build_config()
		self.assertEqual((config["light_theme"], config["layout"]["values"]["form_format"]), ("Warm Classic", "Compact"))

	def test_site_default_from_the_retired_layout_preset(self):
		frappe.db.sql("delete from `tabSingles` where doctype=%s and field='default_experience'", SETTINGS_DOCTYPE)
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "default_layout_preset", "Wide")
		frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)
		patch.execute()
		self.assertEqual(frappe.db.get_single_value(SETTINGS_DOCTYPE, "default_experience"), "department-workspace")

	def test_new_check_is_stored_on(self):
		frappe.db.sql("delete from `tabSingles` where doctype=%s and field='allow_user_experience'", SETTINGS_DOCTYPE)
		patch.execute()
		self.assertEqual(frappe.db.get_single_value(SETTINGS_DOCTYPE, "allow_user_experience"), 1)
