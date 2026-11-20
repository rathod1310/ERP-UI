"""The effective configuration sent to the browser (frappe.boot.erpnext_ui)."""

import frappe

from erpnext_ui import __version__
from erpnext_ui.core import compat, experience, preferences, themes
from erpnext_ui.core.settings import get_settings, layout_allowed
from erpnext_ui.experience import packs
from erpnext_ui.experience import resolve as exp_resolve
from erpnext_ui.theme import layouts
from erpnext_ui.theme.tokens import FONTS, THEME_COLOR_TOKENS

# Every complete theme carries these tokens (see theme.resolver.to_tokens).
TOKEN_NAMES = [
	*THEME_COLOR_TOKENS,
	"radius",
	"heading-weight",
	"shadow-sm",
	"shadow-md",
	"shadow-lg",
	"color-scheme",
]

PAYLOAD_VERSION = 2


def _base(settings) -> dict:
	info = compat.status()
	return {
		"payload_version": PAYLOAD_VERSION,
		"app_version": __version__,
		"enabled": settings.enabled,
		"adapter": info["adapter"],
		"versions": info["versions"],
		"debug": settings.debug_logging,
	}


def build_config() -> dict:
	settings = get_settings()
	config = _base(settings)
	if not settings.enabled:
		return config

	catalog = themes.get_catalog(settings.accent_color)
	stored = preferences.get_saved()
	user_appearance = preferences.get_appearance(stored)
	exp = build_experience(settings, catalog, stored)
	current = exp["current"]
	selection = current["selection"]

	config.update(
		{
			"allow_user_selection": int(bool(settings.allow_user_selection)),
			"appearance": user_appearance or settings.default_appearance,
			"appearance_source": "user" if user_appearance else "default",
			"light_theme": selection["light_theme"],
			"dark_theme": selection["dark_theme"],
			"density": selection["density"],
			"font": selection["font"],
			"font_key": FONTS.get(selection["font"], "inter"),
			"saved": {k: v for k, v in selection.items() if current["sources"].get(k) == "user"},
			"defaults": {
				"appearance": settings.default_appearance,
				"light_theme": settings.default_light_theme,
				"dark_theme": settings.default_dark_theme,
				"density": current["pack_selection"]["density"],
				"font": current["pack_selection"]["font"],
				"accent_color": settings.accent_color,
			},
			"can_manage": int(bool(frappe.has_permission("UI Experience Settings", "write"))),
			"backdrops": {
				"enabled": int(bool(settings.enable_backdrops)),
				"through_panels": int(bool(settings.backdrop_through_panels)),
			},
			"experience": exp["payload"],
			"layout": build_layout(settings, current["layout"]),
			"token_names": TOKEN_NAMES,
			"catalog": catalog,
		}
	)
	return config


def _open_groups(settings) -> dict:
	"""Layout permission groups users may adjust (presets are retired: D3)."""
	if not settings.desk_layout:
		return {}
	allowed = layout_allowed(settings)
	allowed["layout_preset"] = False
	return allowed


def effective_for(pack: dict, overrides: dict | None, settings, catalog: list) -> dict:
	"""One pack with the user's overrides, themes checked against the catalog."""
	result = exp_resolve.apply(
		pack,
		overrides,
		theme_open=bool(settings.allow_user_selection),
		layout_open=_open_groups(settings),
	)
	sel = result["selection"]
	for key, mode, fallback in (
		("light_theme", "Light", settings.default_light_theme),
		("dark_theme", "Dark", settings.default_dark_theme),
	):
		# A disabled personal theme falls back to the pack's own, then the site's.
		theme = themes.pick(catalog, mode, sel[key], pack[key], fallback)
		if theme and theme["name"] != sel[key] and result["sources"][key] == "user":
			result["sources"][key] = "pack"
		sel[key] = theme["name"] if theme else None
	result["pack_selection"] = {k: pack[k] for k in packs.THEME_OVERRIDE_KEYS}
	return result


def build_experience(settings, catalog: list, stored: dict) -> dict:
	packs_catalog = experience.get_catalog()
	allowed = experience.allowed_list(settings)
	may_choose = bool(settings.allow_user_experience)
	key, source = exp_resolve.choose(
		packs_catalog,
		site_default=settings.default_experience,
		user_choice=stored.get("experience"),
		allowed=allowed,
		user_may_choose=may_choose,
	)
	overrides = stored.get("overrides") or {}
	keys = exp_resolve.available(packs_catalog, allowed, settings.default_experience) if may_choose else [key]
	if key not in keys:
		keys.insert(0, key)
	available = []
	current = None
	for k in keys:
		pack = packs_catalog[k]
		eff = effective_for(pack, overrides.get(k), settings, catalog)
		if k == key:
			current = eff
		available.append(
			{
				"key": k,
				"title": pack["title"],
				"description": pack["description"],
				"audience": pack["audience"],
				"is_standard": pack["is_standard"],
				"shell": pack["shell"],
				"custom_home": pack["custom_home"],
				"themes": {"light": pack["light_theme"], "dark": pack["dark_theme"]},
				"compatible_themes": pack["compatible_themes"],
				"login": pack["login"],
				"home": {"cards": pack["home_cards"], "charts": pack["home_charts"]},
				"defaults": {**eff["pack_selection"], **pack["layout"]},
				"selection": eff["selection"],
				"layout": eff["layout"],
				"overridden": sorted(k2 for k2, src in eff["sources"].items() if src == "user"),
			}
		)
	pack = packs_catalog[key]
	home_ready = experience.home_page_ready()
	payload = {
		"key": key,
		"title": pack["title"],
		"source": source,
		"shell": pack["shell"],
		"custom_home": pack["custom_home"],
		"home_page": packs.HOME_PAGE if pack["custom_home"] and home_ready else None,
		"home_available": int(home_ready),
		"site_default": settings.default_experience if settings.default_experience in packs_catalog else key,
		"allow_user_experience": int(may_choose),
		"theme_open": int(bool(settings.allow_user_selection)),
		"layout_open": _open_groups(settings),
		"available": available,
	}
	return {"payload": payload, "current": current}


def build_layout(settings, values: dict) -> dict:
	"""The layout block: the experience's values (with the user's overrides) as
	the site values, so the Phase 3 layout engine applies them unchanged."""
	allowed = _open_groups(settings)
	effective = layouts.resolve(site_values=values, allowed={})
	return {
		"enabled": int(bool(settings.desk_layout)),
		**effective,
		"saved": {},
		"allowed": allowed,
		"defaults": {"preset": effective["preset"], "values": dict(values)},
		"registry": layouts.registry(),
	}


def safe_build_config() -> dict:
	"""build_config() that never raises; failures disable the engine for this load."""
	try:
		return build_config()
	except Exception:
		frappe.logger("erpnext_ui").exception("Failed to build UI configuration")
		return {"payload_version": PAYLOAD_VERSION, "app_version": __version__, "enabled": 0, "error": 1}
