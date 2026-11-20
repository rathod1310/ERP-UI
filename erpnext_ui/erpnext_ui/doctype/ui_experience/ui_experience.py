# Copyright (c) 2026, Skydot Infotech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from erpnext_ui.core import experience, themes
from erpnext_ui.core.settings import SETTINGS_DOCTYPE
from erpnext_ui.experience import resolve
from erpnext_ui.experience.packs import DEFAULT_EXPERIENCE

# What an administrator may still change on a standard experience.
STANDARD_EDITABLE = {"enabled", "sort_order", "modified", "modified_by"}


class UIExperience(Document):
	def validate(self):
		self.experience_key = (self.experience_key or "").strip().lower()
		if not resolve.is_key(self.experience_key):
			frappe.throw(_("Key may contain only lower-case letters, digits and hyphens"))
		if frappe.flags.erpnext_ui_sync:
			return
		before = self.get_doc_before_save()
		if self.is_standard or (before and before.is_standard):
			self._protect_standard(before)
		self._validate_themes()
		self._protect_in_use()

	def _protect_standard(self, before):
		if self.is_new():
			frappe.throw(_("Standard experiences are created by the ERPNext UI app"))
		ignore = STANDARD_EDITABLE | {"name", "owner", "creation", "idx", "docstatus"}
		changed = [
			df.fieldname
			for df in self.meta.fields
			if df.fieldname not in ignore and str(before.get(df.fieldname) or "") != str(self.get(df.fieldname) or "")
		]
		if changed:
			frappe.throw(
				_("Standard experiences cannot be edited. Duplicate {0} to make your own.").format(
					frappe.bold(self.experience_name)
				)
			)
		if self.name == DEFAULT_EXPERIENCE and not self.enabled:
			frappe.throw(_("{0} is the fallback experience and cannot be disabled").format(frappe.bold(self.experience_name)))

	def _validate_themes(self):
		for field, mode in (("light_theme", "Light"), ("dark_theme", "Dark")):
			row = frappe.db.get_value("UI Theme", self.get(field), ["mode", "enabled"], as_dict=True)
			if not row:
				frappe.throw(_("Theme {0} does not exist").format(frappe.bold(self.get(field))))
			if row.mode != mode:
				frappe.throw(_("{0} must be a {1} theme").format(_(self.meta.get_label(field)), _(mode)))

	def _protect_in_use(self):
		if not self.enabled and frappe.db.get_single_value(SETTINGS_DOCTYPE, "default_experience") == self.name:
			frappe.throw(_("{0} is the site's default experience and cannot be disabled").format(frappe.bold(self.experience_name)))

	def on_update(self):
		experience.clear_cache()
		themes.clear_cache()

	def on_trash(self):
		if self.is_standard and not frappe.flags.erpnext_ui_sync:
			frappe.throw(_("Standard experiences cannot be deleted; disable them instead"))
		if frappe.db.get_single_value(SETTINGS_DOCTYPE, "default_experience") == self.name:
			frappe.throw(_("{0} is the site's default experience and cannot be deleted").format(frappe.bold(self.experience_name)))

	def after_delete(self):
		experience.clear_cache()
