"""Custom colour engine: two brand colours in, a complete, checked theme out.

An administrator picks a primary and a secondary colour, Light or Dark, and a
Subtle or Strong treatment. Everything else (canvas, surfaces, text, borders,
sidebar roles, states, semantic colours) is derived, and every derived colour
is moved towards black or white until it reaches its contrast floor. The
result passes resolver.CONTRAST_RULES or generate() raises ValueError, so a
generated theme can never be unreadable.

Subtle keeps surfaces neutral and puts colour in the accents; Strong fills the
sidebar with the primary, tints the canvas and adds the gradient backdrop.
"""

from erpnext_ui.theme import colour, resolver

MODES = ("Light", "Dark")
STRENGTHS = ("Subtle", "Strong")

_SEMANTIC = {
	"Light": {"success": "#1e7b4f", "warning": "#a35f00", "danger": "#c0362c", "info": "#2563a8"},
	"Dark": {"success": "#45b07d", "warning": "#d9a23a", "danger": "#e9695e", "info": "#62a0e6"},
}
WHITE, BLACK = "#ffffff", "#000000"


def _readable(value: str, against: str, minimum: float, mode: str) -> str:
	return colour.ensure_contrast(value, against, minimum, WHITE if mode == "Dark" else BLACK)


def _primary(value: str, surface: str, mode: str) -> tuple[str, str]:
	"""The primary moved until it reads on the surface (3:1) and a label reads on it (4.5:1)."""
	primary = _readable(value, surface, 3.0, mode)
	label = colour.best_text_on(primary, light=WHITE, dark="#111827")
	if colour.contrast_ratio(label, primary) < 4.5:
		away = BLACK if label == WHITE else WHITE
		primary = colour.ensure_contrast(primary, label, 4.5, away)
	return primary, label


def generate(primary: str, secondary: str, mode: str = "Light", strength: str = "Subtle") -> dict:
	"""A complete theme definition (resolver format) from two colours."""
	primary = colour.normalise_hex(primary)
	secondary = colour.normalise_hex(secondary)
	if mode not in MODES:
		raise ValueError(f"mode must be one of {MODES}")
	if strength not in STRENGTHS:
		raise ValueError(f"strength must be one of {STRENGTHS}")
	dark, strong = mode == "Dark", strength == "Strong"

	if dark:
		text = "#e8ebef"
		canvas = colour.mix("#0c0e11", primary, 0.10 if strong else 0.04)
		surface = colour.mix("#171a1f", primary, 0.06 if strong else 0.02)
		elevated = colour.mix(surface, WHITE, 0.04)
		muted_surface = colour.mix(surface, WHITE, 0.03)
		navbar = colour.mix(canvas, surface, 0.5)
		sidebar = colour.mix(primary, BLACK, 0.62) if strong else colour.mix("#0f1114", primary, 0.04)
		if strong:
			sidebar = colour.ensure_contrast(sidebar, WHITE, 7.0, BLACK)
		border = colour.mix(surface, WHITE, 0.10)
		border_strong = colour.mix(surface, WHITE, 0.18)
	else:
		text = "#1b222c"
		canvas = colour.mix("#f3f4f6", primary, 0.08 if strong else 0.03)
		surface = colour.mix(WHITE, primary, 0.02) if strong else WHITE
		elevated = surface
		muted_surface = colour.mix(colour.mix(surface, text, 0.04), primary, 0.02)
		navbar = surface
		# A brand-filled sidebar carries white text: darkened until that reads at 7:1.
		sidebar = (
			colour.ensure_contrast(colour.mix(primary, BLACK, 0.15), WHITE, 7.0, BLACK)
			if strong
			else colour.mix("#f7f8fa", primary, 0.04)
		)
		border = colour.mix(surface, text, 0.12)
		border_strong = colour.mix(surface, text, 0.22)

	# Text must read on both the surface and the canvas.
	text_secondary = _readable(_readable("#b4bcc6" if dark else "#4a5361", surface, 4.5, mode), canvas, 4.5, mode)
	text_muted = _readable("#8c96a2" if dark else "#646d7b", surface, 4.3, mode)
	prim, label = _primary(primary, surface, mode)

	colours = {
		"primary": prim,
		"primary-contrast": label,
		"secondary": _readable(secondary, surface, 3.0, mode),
		"background": canvas,
		"surface": surface,
		"surface-elevated": elevated,
		"surface-muted": muted_surface,
		"control-bg": elevated if dark else surface,
		"navbar-bg": navbar,
		"sidebar-bg": sidebar,
		"text": _readable(_readable(text, surface, 7.0, mode), canvas, 7.0, mode),
		"text-secondary": text_secondary,
		"text-muted": text_muted,
		"border": border,
		"border-strong": border_strong,
		**{k: _readable(v, surface, 3.0, mode) for k, v in _SEMANTIC[mode].items()},
		"hover": colour.mix(surface, prim, 0.10 if dark else 0.06),
		"focus": _readable(colour.mix(prim, surface, 0.2), surface, 3.0, mode),
		"disabled-bg": colour.mix(surface, text, 0.05),
		"disabled-text": colour.mix(text, surface, 0.5),
	}
	colours.update(resolver.derive_sidebar_roles(colours, mode))

	definition = {
		"mode": mode,
		"colours": colours,
		"corner_radius": 8,
		"shadow_style": "Subtle",
		"heading_weight": 600,
		"recipe": {
			"sidebar_style": "Attached Gradient" if strong else "Attached",
			"navbar_style": "Solid",
			"surface_style": "Bordered",
			"input_style": "Outlined",
			"table_style": "Lined",
			"button_shape": "Rounded",
			"backdrop": "Subtle Gradient" if strong else "None",
			"heading_font": "Body Font",
			"numeral_style": "Proportional",
		},
	}
	failures = resolver.contrast_failures(colours)
	if failures:
		pairs = ", ".join(f"{f['foreground']} on {f['background']} ({f['ratio']})" for f in failures)
		raise ValueError(f"These colours cannot produce a readable theme: {pairs}")
	return definition
