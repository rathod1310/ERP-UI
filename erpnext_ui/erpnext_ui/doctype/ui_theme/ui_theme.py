# Copyright (c) 2026, Skydot Infotech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from erpnext_ui.core import themes
from erpnext_ui.core.settings import SETTINGS_DOCTYPE
from erpnext_ui.theme import resolver
from erpnext_ui.theme.presets import FALLBACK_DARK, FALLBACK_LIGHT
from erpnext_ui.theme.tokens import RECIPES, THEME_COLOR_TOKENS, field_for

# What an administrator may still change on a standard preset.
STANDARD_EDITABLE = {"enabled", "sort_order", "modified", "modified_by"}
PROTECTED_DEFINITION = {
	"theme_name",
	"mode",
	"description",
	"based_on",
	"corner_radius",
	"shadow_style",
	"heading_weight",
	"is_standard",
	*RECIPES,
	*(field_for(t) for t in THEME_COLOR_TOKENS),
}


class UITheme(Document):
	def validate(self):
		self.theme_key = resolver.slug(self.theme_name)
		if not self.theme_key:
			frappe.throw(_("Theme name must contain letters or numbers"))
		if frappe.flags.erpnext_ui_sync:
			return
		before = self.get_doc_before_save()
		if self.is_standard or (before and before.is_standard):
			self._protect_standard()
		else:
			self._validate_custom()
		self._protect_in_use()

	def _protect_standard(self):
		before = self.get_doc_before_save()
		if self.is_new():
			frappe.throw(_("Standard presets are created by the ERPNext UI app"))
		changed = [f for f in PROTECTED_DEFINITION if str(before.get(f) or "") != str(self.get(f) or "")]
		if changed:
			frappe.throw(
				_("Standard presets cannot be edited. Create a new theme based on {0} instead.").format(
					frappe.bold(self.name)
				)
			)
		if self.name in (FALLBACK_LIGHT, FALLBACK_DARK) and not self.enabled:
			frappe.throw(
				_("{0} is the safe fallback theme and cannot be disabled").format(frappe.bold(self.name))
			)

	def _validate_custom(self):
		if self.based_on:
			if self.based_on == self.name:
				frappe.throw(_("A theme cannot be based on itself"))
			if frappe.db.get_value("UI Theme", self.based_on, "mode") != self.mode:
				frappe.throw(_("Based On must be a theme with the same mode ({0})").format(_(self.mode)))
		if self.corner_radius is None:
			self.corner_radius = 6

		defn = themes.row_to_definition(self)
		base = frappe.get_doc("UI Theme", self.based_on) if self.based_on else None
		complete = resolver.complete_definition(defn, themes.row_to_definition(base) if base else None)
		# Check the values that were actually entered plus the inherited ones.
		check = {
			**defn,
			**{
				k: complete[k] for k in ("corner_radius", "shadow_style", "heading_weight") if not defn.get(k)
			},
		}
		check["mode"] = self.mode
		errors = resolver.validate_definition(check, require_all_colours=False)
		if errors:
			frappe.throw("<br>".join(frappe.utils.escape_html(e) for e in errors), title=_("Invalid Theme"))

		failures = resolver.contrast_failures(complete["colours"])
		if failures:
			rows = "".join(
				"<li>{} on {}: {} (needs {})</li>".format(
					_(THEME_COLOR_TOKENS[f["foreground"]][1]),
					_(THEME_COLOR_TOKENS[f["background"]][1]),
					f["ratio"],
					f["minimum"],
				)
				for f in failures
			)
			frappe.throw(
				_("Some colour pairs are not readable enough:") + f"<ul>{rows}</ul>",
				title=_("Insufficient Contrast"),
			)

	def _protect_in_use(self):
		if self.enabled:
			return
		for field in ("default_light_theme", "default_dark_theme"):
			if frappe.db.get_single_value(SETTINGS_DOCTYPE, field) == self.name:
				frappe.throw(
					_("{0} is a site default in UI Experience Settings and cannot be disabled").format(
						frappe.bold(self.name)
					)
				)

	def on_update(self):
		themes.clear_cache()

	def on_trash(self):
		if self.is_standard and not frappe.flags.erpnext_ui_sync:
			frappe.throw(_("Standard presets cannot be deleted; disable them instead"))
		for field in ("default_light_theme", "default_dark_theme"):
			if frappe.db.get_single_value(SETTINGS_DOCTYPE, field) == self.name:
				frappe.throw(_("{0} is a site default and cannot be deleted").format(frappe.bold(self.name)))
		if frappe.db.exists("UI Theme", {"based_on": self.name}):
			frappe.throw(_("Other themes are based on {0}").format(frappe.bold(self.name)))

	def after_delete(self):
		themes.clear_cache()
