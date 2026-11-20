"""Turn theme definitions into complete, validated token maps."""

import re

from erpnext_ui.theme import colour
from erpnext_ui.theme.presets import FALLBACK_DARK, FALLBACK_LIGHT, PRESETS
from erpnext_ui.theme.tokens import (
	CORNER_RADIUS_RANGE,
	HEADING_WEIGHTS,
	RECIPE_DEFAULTS,
	RECIPES,
	SHADOW_STYLES,
	THEME_COLOR_TOKENS,
	THEME_MODES,
)

_SHADOW_RGB = {"Light": "16, 24, 40", "Dark": "0, 0, 0"}
# style -> (sm, md, lg) as (y, blur, alpha) layers; dark mode uses stronger alpha.
_SHADOW_LAYERS = {
	"Flat": ((), ((0, 0, 0.08, 1),), ((4, 12, 0.10, 0),)),
	"Subtle": (((1, 2, 0.06, 0),), ((1, 3, 0.08, 0), (1, 2, 0.04, 0)), ((8, 24, 0.12, 0),)),
	"Raised": (((1, 3, 0.10, 0),), ((2, 6, 0.10, 0), (1, 2, 0.06, 0)), ((12, 32, 0.16, 0),)),
}
_DARK_ALPHA_FACTOR = 3.5

# The minimum WCAG contrast ratios every theme must meet. Custom themes that
# miss these are rejected; tests hold the presets to the same standard.
CONTRAST_RULES = (
	("text", "surface", 7.0),
	("text", "background", 7.0),
	("text-secondary", "surface", 4.5),
	("text-secondary", "background", 4.5),
	("text-muted", "surface", 3.0),
	("primary-contrast", "primary", 4.5),
	("primary", "surface", 3.0),
	("focus", "surface", 3.0),
	("danger", "surface", 3.0),
	("success", "surface", 3.0),
	("warning", "surface", 3.0),
	("info", "surface", 3.0),
	("sidebar-text", "sidebar-bg", 4.5),
	("sidebar-active-text", "sidebar-active-bg", 4.5),
)

SIDEBAR_ROLES = ("sidebar-text", "sidebar-active-bg", "sidebar-active-text")


def slug(name: str) -> str:
	return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def shadows(mode: str, style: str) -> dict[str, str]:
	rgb = _SHADOW_RGB.get(mode, _SHADOW_RGB["Light"])
	factor = _DARK_ALPHA_FACTOR if mode == "Dark" else 1
	out = {}
	for size, layers in zip(
		("sm", "md", "lg"), _SHADOW_LAYERS.get(style, _SHADOW_LAYERS["Subtle"]), strict=True
	):
		if not layers:
			out[f"shadow-{size}"] = "none"
			continue
		parts = []
		for y, blur, alpha, spread in layers:
			a = min(round(alpha * factor, 2), 0.6)
			parts.append(f"0 {y}px {blur}px {spread}px rgba({rgb}, {a})")
		out[f"shadow-{size}"] = ", ".join(parts)
	return out


def fallback_name(mode: str) -> str:
	return FALLBACK_DARK if mode == "Dark" else FALLBACK_LIGHT


def validate_definition(defn: dict, require_all_colours=True) -> list[str]:
	"""Return a list of human-readable problems with a theme definition."""
	errors = []
	if defn.get("mode") not in THEME_MODES:
		errors.append(f"Mode must be one of {', '.join(THEME_MODES)}")
	colours = defn.get("colours") or {}
	for token in THEME_COLOR_TOKENS:
		value = colours.get(token)
		if value in (None, ""):
			if require_all_colours:
				errors.append(f"{THEME_COLOR_TOKENS[token][1]} is required")
			continue
		if not colour.is_hex(value):
			errors.append(f"{THEME_COLOR_TOKENS[token][1]} must be a #rrggbb colour")
	unknown = set(colours) - set(THEME_COLOR_TOKENS)
	if unknown:
		errors.append("Unknown colour tokens: " + ", ".join(sorted(unknown)))
	radius = defn.get("corner_radius")
	if (
		not isinstance(radius, int)
		or isinstance(radius, bool)
		or not (CORNER_RADIUS_RANGE[0] <= radius <= CORNER_RADIUS_RANGE[1])
	):
		errors.append(f"Corner radius must be between {CORNER_RADIUS_RANGE[0]} and {CORNER_RADIUS_RANGE[1]}")
	if defn.get("shadow_style") not in SHADOW_STYLES:
		errors.append(f"Shadow style must be one of {', '.join(SHADOW_STYLES)}")
	if defn.get("heading_weight") not in HEADING_WEIGHTS:
		errors.append("Heading weight must be 500, 600 or 700")
	for field, value in (defn.get("recipe") or {}).items():
		if field not in RECIPES:
			errors.append(f"Unknown recipe setting: {field}")
		elif value not in RECIPES[field][1]:
			errors.append(f"{field.replace('_', ' ').title()} must be one of {', '.join(RECIPES[field][1])}")
	return errors


def derive_sidebar_roles(colours: dict, mode: str) -> dict:
	"""Sidebar text and active colours for a sidebar background that has none
	(Phase 1 themes had only sidebar-bg): readable text on the sidebar, and an
	active fill tinted with the primary."""
	bg = colours["sidebar-bg"]
	white, black = "#ffffff", "#000000"
	if colour.best_text_on(bg, light=white, dark=black) == white:
		# A dark or brand-filled sidebar: light text, active item a step lighter,
		# or a step darker when lightening would cost the white label its contrast.
		text = colour.ensure_contrast(colour.mix(bg, white, 0.82), bg, 4.5, white)
		active_bg = colour.mix(bg, white, 0.14)
		if colour.contrast_ratio(white, active_bg) < 4.5:
			active_bg = colour.mix(bg, black, 0.3)
		active_text = colour.ensure_contrast(white, active_bg, 4.5, white)
	else:
		text = colour.ensure_contrast(colours.get("text-secondary", colours["text"]), bg, 4.5, black)
		active_bg = colour.mix(colours["surface"], colours["primary"], 0.12 if mode == "Light" else 0.22)
		if colour.best_text_on(active_bg, light=white, dark=black) == white:
			active_bg = colour.mix(bg, colours["primary"], 0.12)
		active_text = colour.ensure_contrast(colours["primary"], active_bg, 4.5, black)
	return {"sidebar-text": text, "sidebar-active-bg": active_bg, "sidebar-active-text": active_text}


def complete_definition(defn: dict, base: dict | None = None) -> dict:
	"""Fill missing colours/shape values from `base`, then from the standard
	fallback preset of the same mode. Never mutates the input."""
	mode = defn.get("mode") if defn.get("mode") in THEME_MODES else "Light"
	fallback = PRESETS[fallback_name(mode)]
	layers = [fallback]
	if base and base.get("mode") == mode:
		layers.append(base)
	layers.append(defn)

	colours = {}
	for layer in layers:
		for token, value in (layer.get("colours") or {}).items():
			if token in THEME_COLOR_TOKENS and colour.is_hex(value):
				colours[token] = value.lower()
	# The fallback's sidebar roles belong to the fallback's sidebar; a theme
	# that sets its own sidebar background without them gets derived roles.
	own = [layer.get("colours") or {} for layer in layers[1:]]
	if any(c.get("sidebar-bg") for c in own) and not any(c.get(r) for c in own for r in SIDEBAR_ROLES):
		colours.update(derive_sidebar_roles(colours, mode))

	# Recipes come from the theme and its base only, never from the fallback:
	# a theme without one (Phase 1 custom themes) keeps the neutral defaults.
	recipe = {}
	for field, options in RECIPES.items():
		recipe[field] = RECIPE_DEFAULTS[field]
		for layer in layers[1:]:
			value = (layer.get("recipe") or {}).get(field)
			if value in options[1]:
				recipe[field] = value

	out = {"mode": mode, "colours": colours, "recipe": recipe}
	for key in ("corner_radius", "shadow_style", "heading_weight"):
		for layer in reversed(layers):
			if layer.get(key) not in (None, ""):
				out[key] = layer[key]
				break
	try:
		out["corner_radius"] = int(out["corner_radius"])
		out["heading_weight"] = int(out["heading_weight"])
	except (TypeError, ValueError):
		out["corner_radius"] = fallback["corner_radius"]
		out["heading_weight"] = fallback["heading_weight"]
	return out


def apply_accent(defn: dict, accent: str) -> dict:
	"""Replace the brand accent while keeping every contrast rule satisfied."""
	accent = colour.normalise_hex(accent)
	colours = dict(defn["colours"])
	surface = colours["surface"]
	towards = "#ffffff" if defn["mode"] == "Dark" else "#000000"

	primary = colour.ensure_contrast(accent, surface, 3.0, towards)
	contrast_text = colour.best_text_on(primary)
	if colour.contrast_ratio(contrast_text, primary) < 4.5:
		# Push the accent away from its text colour until the button label reads.
		away = "#000000" if contrast_text == "#ffffff" else "#ffffff"
		primary = colour.ensure_contrast(primary, contrast_text, 4.5, away)
	colours["primary"] = primary
	colours["primary-contrast"] = contrast_text
	colours["focus"] = colour.ensure_contrast(colour.mix(primary, surface, 0.2), surface, 3.0, towards)
	return {**defn, "colours": colours}


def to_tokens(defn: dict) -> dict[str, str]:
	"""Flatten a complete definition into `--ui-<token>` values (without the prefix)."""
	tokens = dict(defn["colours"])
	tokens["radius"] = f"{int(defn['corner_radius'])}px"
	tokens["heading-weight"] = str(int(defn["heading_weight"]))
	tokens.update(shadows(defn["mode"], defn["shadow_style"]))
	tokens["color-scheme"] = defn["mode"].lower()
	return tokens


def recipe_attributes(recipe: dict) -> dict[str, str]:
	"""Recipe labels -> html[data-ui-t-<name>] values."""
	return {RECIPES[f][0]: RECIPES[f][1][v] for f, v in recipe.items() if f in RECIPES and v in RECIPES[f][1]}


def contrast_report(colours: dict[str, str]) -> list[dict]:
	report = []
	for fg, bg, minimum in CONTRAST_RULES:
		ratio = colour.contrast_ratio(colours[fg], colours[bg])
		report.append(
			{
				"foreground": fg,
				"background": bg,
				"ratio": round(ratio, 2),
				"minimum": minimum,
				"ok": ratio >= minimum,
			}
		)
	return report


def contrast_failures(colours: dict[str, str]) -> list[dict]:
	return [row for row in contrast_report(colours) if not row["ok"]]
