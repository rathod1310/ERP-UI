"""Layout presets and presentation formats (Phase 3, milestone 1).

Pure Python, no database. Layout is independent of the theme: any theme can be
combined with any preset, and a preset is nothing more than a value for each
format category below. The browser receives this registry in the boot payload
and resolves previews with the same rules (public/js/layout/resolve.js).

Resolution, per category (resolve()):
  1. the user's own value for the category, if users may change it;
  2. the user's chosen preset, if they chose one;
  3. otherwise the site default for the category, if the administrator set one;
  4. otherwise the site default preset.
"""

# key -> (label, permission group, options as (value, attribute, description))
CATEGORIES: dict[str, dict] = {
	"navigation": {
		"label": "Navigation",
		"group": "navigation",
		"options": (
			("Standard", "standard", "Full sidebar with icons and labels."),
			("Compact", "compact", "A narrower sidebar with smaller items."),
			("Collapsed", "collapsed", "The sidebar starts collapsed to icons; expand it any time."),
		),
	},
	"workspace_format": {
		"label": "Workspace",
		"group": "workspace",
		"options": (
			("Standard", "standard", "Flat cards in an even grid."),
			("Cards", "cards", "Raised cards with larger shortcuts."),
			("Compact", "compact", "Small shortcuts and tight spacing; more fits on screen."),
			("Comfortable", "comfortable", "Generous spacing between and inside cards."),
		),
	},
	"form_format": {
		"label": "Forms",
		"group": "forms",
		"options": (
			("Standard", "standard", "Field sizes follow your density setting."),
			("Compact", "compact", "Smaller fields and less space between them."),
			("Comfortable", "comfortable", "Taller fields and more space between sections."),
		),
	},
	"list_format": {
		"label": "Lists and Tables",
		"group": "lists",
		"options": (
			("Standard", "standard", "Row height follows your density setting."),
			("Compact", "compact", "Short rows; more records per screen."),
			("Comfortable", "comfortable", "Tall rows with more padding."),
		),
	},
	"content_width": {
		"label": "Content Width",
		"group": "content",
		"options": (
			("Standard", "standard", "Pages use the screen width; forms and workspaces keep a readable width."),
			("Full Width", "full", "Everything, including forms and workspaces, uses the full width."),
			("Contained", "contained", "Pages are at most 1440 px wide."),
			("Narrow", "narrow", "Pages are at most 1120 px wide."),
		),
	},
	"card_style": {
		"label": "Cards",
		"group": "content",
		"options": (
			("Bordered", "bordered", "Content sits in cards with a border and a soft shadow."),
			("Minimal", "minimal", "Cards without border or shadow."),
		),
	},
	"page_background": {
		"label": "Page Background",
		"group": "content",
		"options": (
			("Tinted", "tinted", "A subtle tint behind the content cards."),
			("Plain", "plain", "The page uses the card colour, like native ERPNext."),
		),
	},
}

LAYOUT_KEYS = tuple(CATEGORIES)

# Permission groups an administrator can open or close for users.
GROUPS = {
	"layout_preset": "Layout Presets",
	"navigation": "Navigation",
	"workspace": "Workspace",
	"forms": "Forms",
	"lists": "Lists and Tables",
	"content": "Content and Cards",
}

PRESETS: dict[str, dict] = {
	"Classic": {
		"description": "The familiar ERPNext look: white pages, full sidebar, roomy forms.",
		"values": {
			"navigation": "Standard",
			"workspace_format": "Standard",
			"form_format": "Comfortable",
			"list_format": "Standard",
			"content_width": "Standard",
			"card_style": "Minimal",
			"page_background": "Plain",
		},
	},
	"Modern": {
		"description": "Tinted page with clearly separated content cards.",
		"values": {
			"navigation": "Standard",
			"workspace_format": "Standard",
			"form_format": "Standard",
			"list_format": "Standard",
			"content_width": "Standard",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
	},
	"Compact": {
		"description": "Narrow sidebar, smaller fields and short table rows for dense work.",
		"values": {
			"navigation": "Compact",
			"workspace_format": "Compact",
			"form_format": "Compact",
			"list_format": "Compact",
			"content_width": "Standard",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
	},
	"Wide": {
		"description": "Collapsed sidebar and full-width content for wide screens and big tables.",
		"values": {
			"navigation": "Collapsed",
			"workspace_format": "Standard",
			"form_format": "Standard",
			"list_format": "Standard",
			"content_width": "Full Width",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
	},
}

# Modern reproduces the Phase 2 Desk exactly, so upgraded sites look the same.
DEFAULT_PRESET = "Modern"
PRESET_NAMES = tuple(PRESETS)


def options(key: str) -> tuple[str, ...]:
	return tuple(o[0] for o in CATEGORIES[key]["options"])


def attribute(key: str, value: str) -> str:
	for option, attr, _description in CATEGORIES[key]["options"]:
		if option == value:
			return attr
	raise ValueError(f"{key}: {value}")


def group_of(key: str) -> str:
	return "layout_preset" if key == "layout_preset" else CATEGORIES[key]["group"]


def is_valid(key: str, value) -> bool:
	if key == "layout_preset":
		return value in PRESETS
	return key in CATEGORIES and value in options(key)


def resolve(
	*,
	site_preset: str | None = None,
	site_values: dict | None = None,
	user_preset: str | None = None,
	user_values: dict | None = None,
	allowed: dict | None = None,
) -> dict:
	"""The effective layout.

	`allowed` maps permission groups to booleans; a group that is not allowed
	ignores the user's value. Invalid values anywhere are ignored, so the result
	is always complete and valid.
	"""
	allowed = allowed or {}
	site_values = site_values or {}
	user_values = user_values or {}
	site_preset = site_preset if site_preset in PRESETS else DEFAULT_PRESET
	use_user_preset = bool(allowed.get("layout_preset")) and user_preset in PRESETS
	preset = user_preset if use_user_preset else site_preset

	values, sources = {}, {}
	for key in LAYOUT_KEYS:
		if allowed.get(group_of(key)) and is_valid(key, user_values.get(key)):
			values[key], sources[key] = user_values[key], "user"
		elif use_user_preset:
			values[key], sources[key] = PRESETS[preset]["values"][key], "preset"
		elif is_valid(key, site_values.get(key)):
			values[key], sources[key] = site_values[key], "site"
		else:
			values[key], sources[key] = PRESETS[preset]["values"][key], "preset"

	matches = [name for name, p in PRESETS.items() if p["values"] == values]
	return {
		"preset": preset,
		# The preset whose values the result equals, or None ("Custom").
		"matches": preset if preset in matches else (matches[0] if matches else None),
		"values": values,
		"sources": sources,
		"attributes": {key: attribute(key, values[key]) for key in LAYOUT_KEYS},
	}


def registry() -> dict:
	"""JSON-safe description of presets and categories for the browser."""
	return {
		"presets": [
			{"name": name, "description": p["description"], "values": dict(p["values"])}
			for name, p in PRESETS.items()
		],
		"categories": [
			{
				"key": key,
				"label": c["label"],
				"group": c["group"],
				"options": [{"value": v, "attribute": a, "description": d} for v, a, d in c["options"]],
			}
			for key, c in CATEGORIES.items()
		],
		"groups": dict(GROUPS),
		"default_preset": DEFAULT_PRESET,
	}
