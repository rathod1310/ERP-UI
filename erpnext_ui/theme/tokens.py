"""The token registry.

Two kinds of token exist:

* Theme tokens (THEME_COLOR_TOKENS plus the shape/typography keys below) vary
  per theme. Their values live in UI Theme records, are resolved on the server
  and written into the page as `--ui-<name>` custom properties.
* Static tokens (typography scale, layout, component sizes, density) are the
  same for every theme and are declared once in public/css/tokens/*.css.
  STATIC_TOKENS lists them so documentation and tests can check that the CSS
  and the registry agree.

UI Theme field names are the token names with "-" replaced by "_".
"""

# name -> (category, label)
THEME_COLOR_TOKENS: dict[str, tuple[str, str]] = {
	"primary": ("brand", "Primary"),
	"primary-contrast": ("brand", "Text on Primary"),
	"secondary": ("brand", "Secondary"),
	"background": ("surface", "Background"),
	"surface": ("surface", "Surface"),
	"surface-elevated": ("surface", "Surface Elevated"),
	"surface-muted": ("surface", "Surface Muted"),
	"control-bg": ("surface", "Control Background"),
	"navbar-bg": ("surface", "Navbar Background"),
	"sidebar-bg": ("surface", "Sidebar Background"),
	"sidebar-text": ("sidebar", "Sidebar Text"),
	"sidebar-active-bg": ("sidebar", "Sidebar Active Background"),
	"sidebar-active-text": ("sidebar", "Sidebar Active Text"),
	"text": ("text", "Main Text"),
	"text-secondary": ("text", "Secondary Text"),
	"text-muted": ("text", "Muted Text"),
	"border": ("border", "Border"),
	"border-strong": ("border", "Border Strong"),
	"success": ("semantic", "Success"),
	"warning": ("semantic", "Warning"),
	"danger": ("semantic", "Danger"),
	"info": ("semantic", "Information"),
	"hover": ("state", "Hover"),
	"focus": ("state", "Focus Ring"),
	"disabled-bg": ("state", "Disabled Background"),
	"disabled-text": ("state", "Disabled Text"),
}

# Non-colour per-theme settings. They are stored as plain fields on UI Theme
# and expanded into tokens by resolver.expand_shape().
SHADOW_STYLES = ("Flat", "Subtle", "Raised")
CORNER_RADIUS_RANGE = (0, 12)
HEADING_WEIGHTS = (500, 600, 700)

APPEARANCES = ("Light", "Dark", "Automatic")
DENSITIES = ("Compact", "Comfortable", "Spacious")

# label -> font key used in data-ui-font. Only fonts that ship with Frappe or
# the operating system are offered: nothing is downloaded from a CDN.
FONTS = {
	"Inter": "inter",
	"System UI": "system",
	"Humanist Sans": "humanist",
}

THEME_MODES = ("Light", "Dark")

# Theme recipes (Phase 3, M2): the structural choices that make each theme a
# design rather than a palette. Each option is implemented once in
# css/adapters/v16/recipes.scss and selected through html[data-ui-t-<name>].
# field -> (attribute name, options as label -> attribute value)
RECIPES: dict[str, tuple[str, dict[str, str]]] = {
	"sidebar_style": ("sidebar", {"Attached": "attached", "Attached Gradient": "gradient", "Floating": "floating"}),
	"navbar_style": ("navbar", {"Solid": "solid", "Translucent": "translucent", "Transparent": "transparent"}),
	"surface_style": ("surface", {"Bordered": "bordered", "Raised": "raised", "Flat": "flat"}),
	"input_style": ("input", {"Outlined": "outlined", "Filled": "filled", "Underline": "underline"}),
	"table_style": ("table", {"Lined": "lined", "Zebra": "zebra", "Rows": "rows", "Ruled": "ruled"}),
	"button_shape": ("button", {"Square": "square", "Rounded": "rounded", "Pill": "pill"}),
	"backdrop": (
		"backdrop",
		{
			"None": "none",
			"Subtle Gradient": "gradient",
			"Soft Geometric": "geometric",
			"Fine Texture": "texture",
			"Paper Grain": "grain",
			"Minimal Abstract": "glow",
			"Neutral Mesh": "mesh",
		},
	),
	"heading_font": ("heading", {"Body Font": "body", "Serif": "serif"}),
	"numeral_style": ("numerals", {"Proportional": "proportional", "Tabular Mono": "mono"}),
}
RECIPE_DEFAULTS = {
	"sidebar_style": "Attached",
	"navbar_style": "Solid",
	"surface_style": "Bordered",
	"input_style": "Outlined",
	"table_style": "Lined",
	"button_shape": "Rounded",
	"backdrop": "None",
	"heading_font": "Body Font",
	"numeral_style": "Proportional",
}

# Tokens declared in CSS, grouped by category (used by docs and tests).
STATIC_TOKENS: dict[str, tuple[str, ...]] = {
	"typography": (
		"font-family",
		"font-size-xs",
		"font-size-sm",
		"font-size-base",
		"font-size-md",
		"font-size-lg",
		"font-size-xl",
		"font-size-2xl",
		"font-weight-regular",
		"font-weight-medium",
		"font-weight-semibold",
		"font-weight-bold",
		"line-height-tight",
		"line-height-base",
		"line-height-relaxed",
		"heading-1-size",
		"heading-2-size",
		"heading-3-size",
		"heading-4-size",
		"label-size",
		"label-weight",
		"table-font-size",
	),
	"layout": (
		"sidebar-width",
		"sidebar-width-compact",
		"navbar-height",
		"page-padding",
		"section-spacing",
		"content-max-width",
		"page-head-height",
		"card-padding",
		"sidebar-item-height",
		"gap-xs",
		"gap-sm",
		"gap-md",
		"gap-lg",
		"gap-xl",
		"breakpoint-sm",
		"breakpoint-md",
		"breakpoint-lg",
		"breakpoint-xl",
	),
	"component": (
		"button-height",
		"button-height-sm",
		"input-height",
		"radius-sm",
		"radius-md",
		"radius-lg",
		"card-radius",
		"input-radius",
		"dialog-radius",
		"border-width",
		"icon-size-sm",
		"icon-size-md",
		"icon-size-lg",
		"table-row-height",
		"table-cell-padding-y",
		"table-cell-padding-x",
	),
}


def field_for(token: str) -> str:
	return token.replace("-", "_")


def token_for(field: str) -> str:
	return field.replace("_", "-")
