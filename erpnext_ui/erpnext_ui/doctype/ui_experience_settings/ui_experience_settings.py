# Copyright (c) 2026, Skydot Infotech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from erpnext_ui.core import experience, themes
from erpnext_ui.theme import colour


class UIExperienceSettings(Document):
	def validate(self):
		if self.default_experience:
			row = frappe.db.get_value("UI Experience", self.default_experience, ["enabled", "experience_name"], as_dict=True)
			if not row:
				frappe.throw(_("Experience {0} does not exist").format(frappe.bold(self.default_experience)))
			if not row.enabled:
				frappe.throw(_("Experience {0} is disabled").format(frappe.bold(row.experience_name)))
		for field, mode in (("default_light_theme", "Light"), ("default_dark_theme", "Dark")):
			name = self.get(field)
			if not name:
				continue
			row = frappe.db.get_value("UI Theme", name, ["mode", "enabled"], as_dict=True)
			if not row:
				frappe.throw(_("Theme {0} does not exist").format(frappe.bold(name)))
			if row.mode != mode:
				frappe.throw(_("{0} must be a {1} theme").format(_(self.meta.get_label(field)), _(mode)))
			if not row.enabled:
				frappe.throw(_("Theme {0} is disabled").format(frappe.bold(name)))
		if self.accent_color:
			try:
				self.accent_color = colour.normalise_hex(self.accent_color)
			except ValueError:
				frappe.throw(_("Accent colour must be a #rrggbb value"))

	def on_update(self):
		themes.clear_cache()
		experience.clear_cache()
