// Pure functions that decide which theme applies. No DOM, no frappe globals.

import { isSafeKey, sanitiseTokens } from "./tokens.js";

export const APPEARANCES = ["Light", "Dark", "Automatic"];
export const DENSITIES = ["Compact", "Comfortable", "Spacious"];
export const FONT_KEYS = { Inter: "inter", "System UI": "system", "Humanist Sans": "humanist" };
export const FALLBACK_THEMES = { Light: "Corporate Blue", Dark: "Graphite Dark" };
// Theme recipe attributes (theme/tokens.py RECIPES) -> html[data-ui-t-<name>].
export const RECIPE_ATTRIBUTES = [
	"sidebar",
	"navbar",
	"surface",
	"input",
	"table",
	"button",
	"backdrop",
	"heading",
	"numerals",
];
const RECIPE_VALUE_RE = /^[a-z][a-z-]{0,20}$/;

/** Keep only known recipe attributes with safe values. */
export function sanitiseRecipe(recipe) {
	const out = {};
	if (!recipe || typeof recipe !== "object") return out;
	for (const name of RECIPE_ATTRIBUTES) {
		if (typeof recipe[name] === "string" && RECIPE_VALUE_RE.test(recipe[name])) out[name] = recipe[name];
	}
	return out;
}

const SELECTION_KEYS = ["appearance", "light_theme", "dark_theme", "density", "font"];

export function resolveMode(appearance, prefersDark) {
	if (appearance === "Dark") return "dark";
	if (appearance === "Automatic") return prefersDark ? "dark" : "light";
	return "light";
}

export function appearanceFromAttribute(value) {
	return { light: "Light", dark: "Dark", automatic: "Automatic" }[value] || null;
}

function isTheme(entry) {
	return (
		entry &&
		typeof entry.name === "string" &&
		isSafeKey(entry.key) &&
		(entry.mode === "Light" || entry.mode === "Dark") &&
		entry.tokens &&
		typeof entry.tokens === "object"
	);
}

/**
 * Validate the boot payload. Anything unusable is replaced by a safe default;
 * a payload that cannot be used at all yields { enabled: false }.
 */
export function normaliseConfig(raw) {
	if (!raw || typeof raw !== "object") return { enabled: false, reason: "missing" };
	if (!raw.enabled)
		return { enabled: false, reason: raw.error ? "server-error" : "disabled", raw };

	const catalog = Array.isArray(raw.catalog) ? raw.catalog.filter(isTheme) : [];
	if (!catalog.length) return { enabled: false, reason: "empty-catalog", raw };

	const defaults = raw.defaults && typeof raw.defaults === "object" ? raw.defaults : {};
	return {
		enabled: true,
		adapter: typeof raw.adapter === "string" ? raw.adapter : null,
		debug: Boolean(raw.debug),
		allow_user_selection: Boolean(raw.allow_user_selection),
		can_manage: Boolean(raw.can_manage),
		appearance: APPEARANCES.includes(raw.appearance) ? raw.appearance : "Light",
		appearance_source: raw.appearance_source === "user" ? "user" : "default",
		light_theme: typeof raw.light_theme === "string" ? raw.light_theme : null,
		dark_theme: typeof raw.dark_theme === "string" ? raw.dark_theme : null,
		density: DENSITIES.includes(raw.density) ? raw.density : "Comfortable",
		font: raw.font in FONT_KEYS ? raw.font : "Inter",
		saved: raw.saved && typeof raw.saved === "object" ? raw.saved : {},
		backdrops: {
			enabled: !raw.backdrops || raw.backdrops.enabled === undefined ? true : Boolean(raw.backdrops.enabled),
			through_panels: Boolean(raw.backdrops && raw.backdrops.through_panels),
		},
		defaults,
		token_names: Array.isArray(raw.token_names)
			? raw.token_names.filter((t) => typeof t === "string")
			: [],
		catalog,
		versions: raw.versions || {},
		app_version: raw.app_version || null,
	};
}

/** Only known keys with valid values may override the saved selection. */
export function sanitisePreview(overrides) {
	const out = {};
	if (!overrides || typeof overrides !== "object") return out;
	if (APPEARANCES.includes(overrides.appearance)) out.appearance = overrides.appearance;
	if (DENSITIES.includes(overrides.density)) out.density = overrides.density;
	if (overrides.font in FONT_KEYS) out.font = overrides.font;
	for (const key of ["light_theme", "dark_theme"]) {
		if (typeof overrides[key] === "string" && overrides[key]) out[key] = overrides[key];
	}
	if (overrides.force_mode === "light" || overrides.force_mode === "dark")
		out.force_mode = overrides.force_mode;
	if (Array.isArray(overrides.catalog)) out.catalog = overrides.catalog.filter(isTheme);
	if (typeof overrides.route === "string") out.route = overrides.route;
	return out;
}

export function selectionFor(config, preview) {
	const sel = {};
	for (const key of SELECTION_KEYS) sel[key] = config[key];
	if (preview) {
		for (const key of SELECTION_KEYS) if (preview[key] !== undefined) sel[key] = preview[key];
		if (preview.force_mode) sel.force_mode = preview.force_mode;
	}
	return sel;
}

export function findTheme(catalog, name, mode) {
	if (!name) return null;
	return catalog.find((t) => t.name === name && t.mode === mode) || null;
}

/**
 * Pick the theme for the current mode, trying in order: the selection, the
 * site default, the standard fallback, then any complete theme of that mode.
 * Returns null only if no complete theme exists for the mode.
 */
export function resolveTheme(config, selection, prefersDark, catalog = config.catalog) {
	const mode = selection.force_mode || resolveMode(selection.appearance, prefersDark);
	const title = mode === "dark" ? "Dark" : "Light";
	const slot = mode === "dark" ? "dark_theme" : "light_theme";
	const candidates = [
		selection[slot],
		config.defaults && config.defaults[slot],
		FALLBACK_THEMES[title],
	];
	const required = config.token_names || [];

	const tried = new Set();
	const attempt = (theme) => {
		if (!theme || tried.has(theme.name)) return null;
		tried.add(theme.name);
		const { tokens, missing } = sanitiseTokens(theme.tokens, required);
		return missing.length ? null : { mode, theme, tokens };
	};

	for (const name of candidates) {
		const hit = attempt(findTheme(catalog, name, title));
		if (hit) return { ...hit, fallback: name !== selection[slot] };
	}
	for (const theme of catalog.filter((t) => t.mode === title)) {
		const hit = attempt(theme);
		if (hit) return { ...hit, fallback: true };
	}
	return null;
}
