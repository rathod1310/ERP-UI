"""Endpoints for the signed-in user's own preferences.

There is no `user` parameter anywhere: every call acts on frappe.session.user.
"""

import frappe
from frappe import _

from erpnext_ui.core import config, experience, preferences, themes
from erpnext_ui.core.settings import get_settings, layout_allowed
from erpnext_ui.experience import packs
from erpnext_ui.experience import resolve as exp_resolve
from erpnext_ui.theme import layouts
from erpnext_ui.theme.tokens import APPEARANCES, DENSITIES, FONTS


def _require_desk_user():
	if frappe.session.user == "Guest":
		raise frappe.PermissionError(_("Please log in"))


def validate_themes(changes: dict, settings) -> dict:
	"""Theme names, density and font that were sent: a valid value, or None for
	"" (go back to the experience's value). Raises ValidationError otherwise."""
	catalog = themes.get_catalog(settings.accent_color)
	clean = {}
	for key, mode in (("light_theme", "Light"), ("dark_theme", "Dark")):
		value = changes.get(key)
		if value is None:
			continue
		if value == "":
			clean[key] = None
		elif themes.find(catalog, value, mode):
			clean[key] = value
		else:
			frappe.throw(
				_("{0} is not an enabled {1} theme").format(frappe.bold(value), _(mode)),
				frappe.ValidationError,
			)
	for key, options in (("density", DENSITIES), ("font", FONTS)):
		value = changes.get(key)
		if value is None:
			continue
		if value == "":
			clean[key] = None
		elif value in options:
			clean[key] = value
		else:
			frappe.throw(_("Invalid {0}").format(key), frappe.ValidationError)
	return clean


def validate_layout(changes: dict) -> dict:
	"""Layout keys that were sent: a valid value, or None for "" (go back to the
	experience's value). Keys that were not sent are left out."""
	clean = {}
	for key in packs.LAYOUT_OVERRIDE_KEYS:
		value = changes.get(key)
		if value is None:
			continue
		if value == "":
			clean[key] = None
		elif layouts.is_valid(key, value):
			clean[key] = value
		else:
			frappe.throw(_("Invalid value for {0}: {1}").format(key, value), frappe.ValidationError)
	return clean


def _current_key(settings, stored) -> str:
	key, _source = exp_resolve.choose(
		experience.get_catalog(),
		site_default=settings.default_experience,
		user_choice=stored.get("experience"),
		allowed=experience.allowed_list(settings),
		user_may_choose=bool(settings.allow_user_experience),
	)
	return key


SITE_NOT_UPDATED = (
	"This site has not been updated for Experience Packs yet, so an experience cannot be applied here. "
	"An administrator needs to run bench migrate for this site."
)


def _check_experience(key: str, settings) -> dict:
	if not experience.home_page_ready():
		frappe.throw(_(SITE_NOT_UPDATED), frappe.ValidationError, title=_("Site Not Updated"))
	catalog = experience.get_catalog()
	if key not in catalog:
		frappe.throw(_("{0} is not an enabled experience").format(frappe.bold(key)), frappe.ValidationError)
	if not settings.allow_user_experience:
		raise frappe.PermissionError(_("Your administrator has chosen the experience for everyone"))
	if key not in exp_resolve.available(catalog, experience.allowed_list(settings), settings.default_experience):
		raise frappe.PermissionError(_("Your administrator does not offer this experience"))
	return catalog[key]


@frappe.whitelist(methods=["GET"])
def get_preferences() -> dict:
	_require_desk_user()
	return config.build_config()


@frappe.whitelist(methods=["POST"])
def save_preferences(
	experience: str | None = None,
	appearance: str | None = None,
	light_theme: str | None = None,
	dark_theme: str | None = None,
	density: str | None = None,
	font: str | None = None,
	navigation: str | None = None,
	workspace_format: str | None = None,
	form_format: str | None = None,
	list_format: str | None = None,
	content_width: str | None = None,
	card_style: str | None = None,
	page_background: str | None = None,
) -> dict:
	"""Save the current user's experience and their adjustments to it, and
	return the new effective configuration.

	`experience` picks a pack (needs "Allow Users to Choose Their Experience"
	and the pack in the allowed list). The other keys are adjustments of that
	pack (or of the current one when no experience is sent): a value that
	equals the pack's own is not stored, "" goes back to the pack's value.
	Theme, density and font need "Allow Users to Adjust Theme, Density and
	Font"; each layout key needs its group open. Appearance is always accepted
	(it is Frappe's own per-user setting).
	"""
	_require_desk_user()
	settings = get_settings()
	if not settings.enabled:
		frappe.throw(_("UI Experience is disabled"), frappe.ValidationError)
	stored = preferences.get_saved()

	if appearance not in (None, "") and appearance not in APPEARANCES:
		frappe.throw(_("Invalid appearance"), frappe.ValidationError)

	if experience:
		pack = _check_experience(experience, settings)
		target = experience
	else:
		target = _current_key(settings, stored)
		pack = experience_catalog_pack(target)

	sent = {
		**validate_themes(
			{"light_theme": light_theme, "dark_theme": dark_theme, "density": density, "font": font}, settings
		),
		**validate_layout(
			{
				"navigation": navigation,
				"workspace_format": workspace_format,
				"form_format": form_format,
				"list_format": list_format,
				"content_width": content_width,
				"card_style": card_style,
				"page_background": page_background,
			}
		),
	}
	current = dict((stored.get("overrides") or {}).get(target) or {})
	for key, value in sent.items():
		if value is None:
			current.pop(key, None)
		else:
			current[key] = value
	new_overrides = exp_resolve.diff_overrides(pack, current)
	_check_open(new_overrides, stored, target, settings)

	if appearance not in (None, ""):
		preferences.set_appearance(appearance)
	preferences.save(
		experience=experience if experience else ...,
		appearance=appearance if appearance not in (None, "") else ...,
		overrides=new_overrides if sent else None,
		pack=target,
	)
	return config.build_config()


def experience_catalog_pack(key: str) -> dict:
	return experience.get_catalog()[key]


def _check_open(new_overrides: dict, stored: dict, target: str, settings):
	"""Adjustments may only be added or changed for keys the site opens."""
	before = (stored.get("overrides") or {}).get(target) or {}
	changed = {k for k, v in new_overrides.items() if before.get(k) != v}
	theme_open = bool(settings.allow_user_selection)
	groups = layout_allowed(settings) if settings.desk_layout else {}
	closed = [
		k
		for k in sorted(changed)
		if (k in packs.THEME_OVERRIDE_KEYS and not theme_open)
		or (k in packs.LAYOUT_OVERRIDE_KEYS and not groups.get(layouts.group_of(k)))
	]
	if closed:
		raise frappe.PermissionError(_("Your administrator does not allow changing: {0}").format(", ".join(closed)))


@frappe.whitelist(methods=["POST"])
def restore_experience(experience: str | None = None) -> dict:
	"""Forget the current user's adjustments to one experience (default: the current one)."""
	_require_desk_user()
	settings = get_settings()
	stored = preferences.get_saved()
	target = experience or _current_key(settings, stored)
	if not exp_resolve.is_key(target):
		frappe.throw(_("Invalid experience"), frappe.ValidationError)
	preferences.save(overrides={}, pack=target)
	return config.build_config()


@frappe.whitelist(methods=["POST"])
def reset_preferences() -> dict:
	"""Forget the current user's experience, adjustments and appearance; site defaults apply again."""
	_require_desk_user()
	preferences.clear()
	preferences.set_appearance(None)
	return config.build_config()
