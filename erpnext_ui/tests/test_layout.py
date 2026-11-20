"""Phase 2: Desk layout switch, the boot payload and the v0_2 upgrade patch.
(Layout presets and formats, Phase 3: test_layouts.py.)"""

import frappe

from erpnext_ui.core.config import build_config
from erpnext_ui.core.settings import DEFAULTS, SETTINGS_DOCTYPE, get_settings
from erpnext_ui.install import ensure_settings
from erpnext_ui.patches.v0_2 import enable_desk_layout
from erpnext_ui.tests.fixtures import USER_A, UITestCase


def _stored(field):
	return frappe.db.sql(
		"select value from `tabSingles` where doctype = %s and field = %s", (SETTINGS_DOCTYPE, field)
	)


def _forget(field):
	frappe.db.sql("delete from `tabSingles` where doctype = %s and field = %s", (SETTINGS_DOCTYPE, field))
	frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)


class TestLayoutSettings(UITestCase):
	def test_defaults(self):
		self.assertEqual(DEFAULTS["desk_layout"], 1)
		# Since Phase 3 the width default is blank: it follows the layout preset.
		self.assertIsNone(DEFAULTS["content_width"])
		meta = frappe.get_meta(SETTINGS_DOCTYPE)
		self.assertEqual(meta.get_field("desk_layout").default, "1")
		self.assertEqual(
			meta.get_field("content_width").options.split("\n"),
			["", "Standard", "Full Width", "Contained", "Narrow"],
		)

	def test_invalid_width_falls_back(self):
		frappe.db.set_single_value(SETTINGS_DOCTYPE, "content_width", "Ultra Wide")
		frappe.clear_document_cache(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE)
		self.assertIsNone(get_settings().content_width)

	def test_payload_carries_layout(self):
		# Layout values come from the experience (Executive Suite: contained).
		self.set_setting(desk_layout=1, default_experience="executive-suite")
		frappe.set_user(USER_A)
		layout = build_config()["layout"]
		self.assertEqual(layout["enabled"], 1)
		self.assertEqual(layout["values"]["content_width"], "Contained")
		self.assertEqual(layout["attributes"]["content_width"], "contained")

	def test_layout_can_be_switched_off_without_disabling_themes(self):
		self.set_setting(desk_layout=0)
		config = build_config()
		self.assertEqual(config["enabled"], 1)
		self.assertEqual(config["layout"]["enabled"], 0)
		self.assertTrue(config["catalog"])

	def test_disabled_engine_sends_no_layout(self):
		self.set_setting(enabled=0)
		self.assertNotIn("layout", build_config())

	def test_layout_payload_holds_only_presentation_data(self):
		"""The layout block carries layout values, the user's own layout choices and
		which categories are open; nothing about other users, roles or documents."""
		frappe.set_user(USER_A)
		layout = build_config()["layout"]
		self.assertEqual(
			set(layout),
			{"enabled", "preset", "matches", "values", "sources", "attributes", "saved", "allowed", "defaults", "registry"},
		)
		self.assertEqual(layout["saved"], {})
		self.assertTrue(all(isinstance(v, bool) for v in layout["allowed"].values()))


class TestEnableDeskLayoutPatch(UITestCase):
	def test_upgrade_turns_layout_on(self):
		"""A Phase 1 site has no stored value; the patch stores the default (on)."""
		_forget("desk_layout")
		_forget("content_width")
		enable_desk_layout.execute()
		self.assertEqual(_stored("desk_layout")[0][0], "1")
		# content_width has no default since Phase 3 (blank: from the preset).
		self.assertIn(_stored("content_width")[0][0], (None, ""))
		self.assertEqual(get_settings().desk_layout, 1)

	def test_patch_keeps_an_administrators_choice(self):
		self.set_setting(desk_layout=0, content_width="Contained")
		enable_desk_layout.execute()
		settings = get_settings()
		self.assertEqual((settings.desk_layout, settings.content_width), (0, "Contained"))

	def test_patch_then_after_migrate_keeps_layout_on(self):
		"""Order during migrate: post-model-sync patches, then after_migrate."""
		_forget("desk_layout")
		enable_desk_layout.execute()
		ensure_settings()
		self.assertEqual(get_settings().desk_layout, 1)
