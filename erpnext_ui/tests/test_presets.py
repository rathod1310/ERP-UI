"""Pure unit tests for the token registry, presets and resolver (no database)."""

from unittest import TestCase

from erpnext_ui.core.config import TOKEN_NAMES
import random

from erpnext_ui.theme import colour, generator, resolver
from erpnext_ui.theme.presets import FALLBACK_DARK, FALLBACK_LIGHT, LEGACY_SUCCESSORS, PRESETS
from erpnext_ui.theme.tokens import RECIPE_DEFAULTS, RECIPES, THEME_COLOR_TOKENS


class TestColour(TestCase):
	def test_contrast_extremes(self):
		self.assertAlmostEqual(colour.contrast_ratio("#000000", "#ffffff"), 21.0, places=2)
		self.assertAlmostEqual(colour.contrast_ratio("#777777", "#777777"), 1.0, places=5)

	def test_normalise_hex(self):
		self.assertEqual(colour.normalise_hex("#ABC"), "#aabbcc")
		self.assertEqual(colour.normalise_hex(" #A1B2C3 "), "#a1b2c3")
		for bad in ("red", "#12345", "#gggggg", "", None, "url(x)"):
			with self.assertRaises(ValueError):
				colour.normalise_hex(bad)

	def test_ensure_contrast_reaches_target(self):
		out = colour.ensure_contrast("#cccccc", "#ffffff", 4.5, "#000000")
		self.assertGreaterEqual(colour.contrast_ratio(out, "#ffffff"), 4.5)


class TestPresets(TestCase):
	def test_collection_with_expected_modes(self):
		"""Eight designs; seven have a dark variant, Graphite Dark is dark-only and
		Warm Classic is light-only. Operations Teal and Mono Ink came with the
		Experience Packs (M3)."""
		self.assertEqual(
			list(PRESETS),
			[
				"Corporate Blue",
				"Slate Professional",
				"Warm Classic",
				"Executive Green",
				"Modern Office",
				"Operations Teal",
				"Mono Ink",
				"Skyline",
				"Corporate Blue Dark",
				"Slate Professional Dark",
				"Executive Green Dark",
				"Graphite Dark",
				"Modern Office Dark",
				"Operations Teal Dark",
				"Mono Ink Dark",
				"Skyline Dark",
			],
		)
		self.assertEqual(PRESETS[FALLBACK_LIGHT]["mode"], "Light")
		self.assertEqual(PRESETS[FALLBACK_DARK]["mode"], "Dark")
		for name, preset in PRESETS.items():
			self.assertEqual(preset["mode"], "Dark" if name.endswith("Dark") else "Light", name)

	def test_every_theme_has_a_complete_valid_recipe(self):
		for name, preset in PRESETS.items():
			with self.subTest(theme=name):
				self.assertEqual(set(preset["recipe"]), set(RECIPES))
				for field, value in preset["recipe"].items():
					self.assertIn(value, RECIPES[field][1])

	def test_themes_are_designs_not_recolours(self):
		"""Light themes differ in structure, not only colour: no two share a recipe."""
		recipes = [tuple(sorted(p["recipe"].items())) for p in PRESETS.values() if p["mode"] == "Light"]
		self.assertEqual(len(recipes), len(set(recipes)))
		self.assertTrue(any(r != tuple(sorted(RECIPE_DEFAULTS.items())) for r in recipes))

	def test_legacy_presets_map_to_enabled_successors_of_the_same_mode(self):
		modes = {"Classic Light": "Light", "Professional Blue": "Light", "Neutral Grey": "Light",
			"Soft Green": "Light", "Professional Dark": "Dark", "Classic Dark": "Dark"}
		for old, new in LEGACY_SUCCESSORS.items():
			self.assertIn(new, PRESETS, old)
			self.assertEqual(PRESETS[new]["mode"], modes[old], old)

	def test_every_preset_is_complete_and_valid(self):
		for name, preset in PRESETS.items():
			with self.subTest(preset=name):
				self.assertEqual(resolver.validate_definition(preset), [])
				self.assertEqual(set(preset["colours"]), set(THEME_COLOR_TOKENS))

	def test_every_preset_meets_contrast_rules(self):
		for name, preset in PRESETS.items():
			with self.subTest(preset=name):
				self.assertEqual(resolver.contrast_failures(preset["colours"]), [])

	def test_presets_are_restrained(self):
		"""Presets share structure: same text/background polarity per mode and
		no saturated neon backgrounds."""
		for name, preset in PRESETS.items():
			with self.subTest(preset=name):
				bg = colour.relative_luminance(preset["colours"]["background"])
				if preset["mode"] == "Light":
					self.assertGreater(bg, 0.85)
				else:
					self.assertLess(bg, 0.02)

	def test_tokens_cover_registry(self):
		for name, preset in PRESETS.items():
			tokens = resolver.to_tokens(resolver.complete_definition(preset))
			self.assertEqual(set(tokens), set(TOKEN_NAMES), name)


class TestResolver(TestCase):
	def test_complete_definition_inherits_missing_values(self):
		out = resolver.complete_definition({"mode": "Dark", "colours": {"primary": "#3366aa"}})
		self.assertEqual(out["colours"]["primary"], "#3366aa")
		self.assertEqual(out["colours"]["surface"], PRESETS[FALLBACK_DARK]["colours"]["surface"])
		self.assertEqual(out["corner_radius"], PRESETS[FALLBACK_DARK]["corner_radius"])

	def test_complete_definition_ignores_bad_values(self):
		out = resolver.complete_definition(
			{"mode": "Light", "colours": {"primary": "red; } body { x", "nonsense": "#000000"}}
		)
		self.assertEqual(out["colours"]["primary"], PRESETS[FALLBACK_LIGHT]["colours"]["primary"])
		self.assertNotIn("nonsense", out["colours"])

	def test_invalid_mode_falls_back_to_light(self):
		out = resolver.complete_definition({"mode": "Neon", "colours": {}})
		self.assertEqual(out["mode"], "Light")

	def test_validate_definition_reports_problems(self):
		errors = resolver.validate_definition(
			{"mode": "Light", "colours": {"primary": "blue"}, "corner_radius": 40, "shadow_style": "Huge"},
			require_all_colours=False,
		)
		self.assertEqual(len(errors), 4)

	def test_accent_keeps_contrast_for_any_colour(self):
		for accent in ("#ffd400", "#ffffff", "#000000", "#ff00ff", "#0b3d91", "#22c55e", "#777777"):
			for name in PRESETS:
				with self.subTest(accent=accent, preset=name):
					out = resolver.apply_accent(resolver.complete_definition(PRESETS[name]), accent)
					self.assertEqual(resolver.contrast_failures(out["colours"]), [])

	def test_shadow_styles(self):
		self.assertEqual(resolver.shadows("Light", "Flat")["shadow-sm"], "none")
		dark = resolver.shadows("Dark", "Subtle")["shadow-md"]
		self.assertIn("rgba(0, 0, 0", dark)

	def test_derived_sidebar_roles_are_readable(self):
		for bg in ("#ffffff", "#f8f9fb", "#161d27", "#1d4f91", "#ffd400", "#808080"):
			colours = {**PRESETS[FALLBACK_LIGHT]["colours"], "sidebar-bg": bg}
			roles = resolver.derive_sidebar_roles(colours, "Light")
			with self.subTest(bg=bg):
				self.assertGreaterEqual(colour.contrast_ratio(roles["sidebar-text"], bg), 4.5)
				self.assertGreaterEqual(
					colour.contrast_ratio(roles["sidebar-active-text"], roles["sidebar-active-bg"]), 4.5
				)

	def test_legacy_definition_without_sidebar_roles_gets_derived_ones(self):
		"""A Phase 1 custom theme (only sidebar-bg) must not inherit the fallback's
		white-on-navy sidebar text."""
		out = resolver.complete_definition({"mode": "Light", "colours": {"sidebar-bg": "#f8f9fb"}})
		self.assertGreaterEqual(colour.contrast_ratio(out["colours"]["sidebar-text"], "#f8f9fb"), 4.5)
		self.assertEqual(out["recipe"], RECIPE_DEFAULTS)

	def test_slug(self):
		self.assertEqual(resolver.slug("Professional Blue"), "professional-blue")
		self.assertEqual(resolver.slug("  A & B  "), "a-b")


class TestColourGenerator(TestCase):
	def test_generated_themes_always_pass_the_contrast_rules(self):
		rng = random.Random(16)
		samples = ["#ffff00", "#00ff00", "#ffffff", "#000000", "#808080", "#2b5d8f"]
		samples += ["#%06x" % rng.randrange(0x1000000) for _ in range(120)]
		for primary in samples:
			for mode in generator.MODES:
				for strength in generator.STRENGTHS:
					with self.subTest(primary=primary, mode=mode, strength=strength):
						defn = generator.generate(primary, rng.choice(samples), mode, strength)
						self.assertEqual(resolver.validate_definition(defn), [])
						self.assertEqual(resolver.contrast_failures(defn["colours"]), [])

	def test_strong_fills_the_sidebar_subtle_keeps_it_neutral(self):
		subtle = generator.generate("#2b5d8f", "#c0782d", "Light", "Subtle")
		strong = generator.generate("#2b5d8f", "#c0782d", "Light", "Strong")
		self.assertGreater(colour.relative_luminance(subtle["colours"]["sidebar-bg"]), 0.8)
		self.assertLess(colour.relative_luminance(strong["colours"]["sidebar-bg"]), 0.15)
		self.assertEqual(strong["recipe"]["backdrop"], "Subtle Gradient")

	def test_bad_input_is_refused(self):
		self.assertRaises(ValueError, generator.generate, "blue", "#000000")
		self.assertRaises(ValueError, generator.generate, "#123456", "#000000", "Neon")
		self.assertRaises(ValueError, generator.generate, "#123456", "#000000", "Light", "Loud")
