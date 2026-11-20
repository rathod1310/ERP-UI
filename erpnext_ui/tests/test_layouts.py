"""Phase 3 milestone 1: layout presets and formats.

Pure registry and resolution tests (shared cases with tests/js/layout.test.mjs
through layout_cases.json) and the v0_3 upgrade patch. Since M3 the layout
values come from Experience Packs; the preference APIs are tested in
test_experiences.py.
"""

import json
import os
import unittest

import frappe

from erpnext_ui.api import settings as settings_api
from erpnext_ui.core import preferences
from erpnext_ui.core.config import build_config
from erpnext_ui.core.settings import SETTINGS_DOCTYPE, get_settings
from erpnext_ui.install import ensure_settings
from erpnext_ui.patches.v0_3 import layout_presets
from erpnext_ui.tests.fixtures import MANAGER, USER_A, USER_B, UITestCase
from erpnext_ui.theme import layouts

FIXTURE = os.path.join(os.path.dirname(__file__), "layout_cases.json")


def _fixture():
	with open(FIXTURE) as f:
		return json.load(f)


class TestLayoutRegistry(unittest.TestCase):
	def test_every_preset_sets_every_category_validly(self):
		for name, preset in layouts.PRESETS.items():
			self.assertEqual(set(preset["values"]), set(layouts.LAYOUT_KEYS), name)
			for key, value in preset["values"].items():
				self.assertTrue(layouts.is_valid(key, value), f"{name}: {key}={value}")

	def test_presets_are_distinct(self):
		values = [tuple(sorted(p["values"].items())) for p in layouts.PRESETS.values()]
		self.assertEqual(len(values), len(set(values)))

	def test_default_preset_is_the_phase_2_desk(self):
		"""Upgraded sites must look exactly as before: Modern has no non-standard format
		except the Phase 2 card style and tinted background."""
		modern = layouts.PRESETS[layouts.DEFAULT_PRESET]["values"]
		self.assertEqual(layouts.DEFAULT_PRESET, "Modern")
		for key in ("navigation", "workspace_format", "form_format", "list_format", "content_width"):
			self.assertEqual(modern[key], "Standard", key)
		self.assertEqual((modern["card_style"], modern["page_background"]), ("Bordered", "Tinted"))

	def test_attributes_are_css_safe(self):
		for key, category in layouts.CATEGORIES.items():
			for _value, attr, _description in category["options"]:
				self.assertRegex(attr, r"^[a-z][a-z-]{0,30}$", key)

	def test_registry_fixture_is_current(self):
		"""tests/layout_cases.json feeds the JS tests; it must match the live registry."""
		self.assertEqual(_fixture()["registry"], json.loads(json.dumps(layouts.registry())))

	def test_shared_resolution_cases(self):
		for case in _fixture()["cases"]:
			result = layouts.resolve(**case["input"])
			got = {k: result[k] for k in ("preset", "matches", "values", "sources", "attributes")}
			self.assertEqual(got, case["expected"], case["name"])


class TestLayoutDefaults(UITestCase):
	"""Since M3 users adjust layout per experience (tests/test_experiences.py);
	the per-category site defaults and presets are retired (decision D3)."""

	def test_reset_settings_restores_layout_defaults(self):
		self.set_setting(default_layout_preset="Wide", allow_navigation=0, default_card_style="Minimal")
		frappe.set_user(MANAGER)
		settings_api.reset_settings()
		settings = get_settings()
		self.assertEqual(settings.default_layout_preset, "Modern")
		self.assertEqual(settings.allow_navigation, 1)
		self.assertIsNone(settings.default_card_style)


def _forget(field):
	frappe.db.sql("delete from `tabSingles` where doctype = %s and field = %s", (SETTINGS_DOCTYPE, field))
	frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)


class TestLayoutPresetsPatch(UITestCase):
	def test_upgrade_stores_defaults_for_new_fields(self):
		for field in layout_presets.NEW_FIELDS:
			_forget(field)
		layout_presets.execute()
		ensure_settings()
		settings = get_settings()
		self.assertEqual(settings.default_layout_preset, "Modern")
		self.assertEqual(
			[settings[f] for f in layout_presets.NEW_FIELDS[1:]], [1] * (len(layout_presets.NEW_FIELDS) - 1)
		)

	def test_phase_2_full_width_becomes_the_preset_width(self):
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "content_width", "Full Width")
		layout_presets.execute()
		self.assertIsNone(get_settings().content_width)
		self.assertEqual(build_config()["layout"]["values"]["content_width"], "Standard")

	def test_patch_keeps_contained_and_admin_choices(self):
		self.set_setting(content_width="Contained", allow_form_format=0)
		layout_presets.execute()
		settings = get_settings()
		self.assertEqual((settings.content_width, settings.allow_form_format), ("Contained", 0))
