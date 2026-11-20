"""Small colour helpers: hex parsing, WCAG contrast and mixing."""

import re

HEX_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


def is_hex(value) -> bool:
	return isinstance(value, str) and bool(HEX_PATTERN.match(value))


def normalise_hex(value: str) -> str:
	"""Return a lower-case #rrggbb string. Accepts #rgb as a convenience."""
	if not isinstance(value, str):
		raise ValueError("colour must be a string")
	value = value.strip()
	if re.match(r"^#[0-9a-fA-F]{3}$", value):
		value = "#" + "".join(ch * 2 for ch in value[1:])
	if not is_hex(value):
		raise ValueError(f"not a #rrggbb colour: {value!r}")
	return value.lower()


def to_rgb(value: str) -> tuple[int, int, int]:
	value = normalise_hex(value)
	return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)


def to_hex(rgb) -> str:
	return "#" + "".join(f"{max(0, min(255, round(c))):02x}" for c in rgb)


def relative_luminance(value: str) -> float:
	def channel(c):
		c = c / 255
		return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

	r, g, b = (channel(c) for c in to_rgb(value))
	return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: str, b: str) -> float:
	la, lb = relative_luminance(a), relative_luminance(b)
	hi, lo = max(la, lb), min(la, lb)
	return (hi + 0.05) / (lo + 0.05)


def mix(a: str, b: str, weight: float) -> str:
	"""Mix `weight` of colour b into colour a (0 = a, 1 = b)."""
	ra, rb = to_rgb(a), to_rgb(b)
	return to_hex(x + (y - x) * weight for x, y in zip(ra, rb, strict=True))


def best_text_on(background: str, light="#ffffff", dark="#111827") -> str:
	"""The more readable of a light or dark text colour on `background`."""
	return light if contrast_ratio(light, background) >= contrast_ratio(dark, background) else dark


def ensure_contrast(colour: str, against: str, minimum: float, towards: str) -> str:
	"""Move `colour` towards `towards` in small steps until it reaches `minimum`
	contrast against `against`. Returns the closest colour found."""
	if contrast_ratio(colour, against) >= minimum:
		return normalise_hex(colour)
	for step in range(1, 21):
		candidate = mix(colour, towards, step * 0.05)
		if contrast_ratio(candidate, against) >= minimum:
			return candidate
	return normalise_hex(towards)
