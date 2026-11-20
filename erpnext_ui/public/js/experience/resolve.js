// Pure helpers for the experience block of the boot payload (see
// erpnext_ui/core/config.py build_experience). No DOM, no frappe globals.
//
// The server resolves every available pack with the user's adjustments, so
// the browser never re-implements the permission rules: a preview of a pack
// shows exactly what saving it would show.

export const COMPONENTS = ["nav", "header", "launcher", "home", "form", "list", "report"];
export const SHELL_ATTRIBUTES = Object.fromEntries(
	COMPONENTS.map((c) => [c, `data-ui-shell-${c}`])
);
export const THEME_KEYS = ["light_theme", "dark_theme", "density", "font"];
export const LAYOUT_KEYS = [
	"navigation",
	"workspace_format",
	"form_format",
	"list_format",
	"content_width",
	"card_style",
	"page_background",
];
export const HOME_PAGE = "ui-home";

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VARIANT_RE = /^[a-z][a-z-]{0,30}$/;

export function isKey(value) {
	return typeof value === "string" && KEY_RE.test(value);
}

function cleanShell(shell) {
	const out = {};
	for (const c of COMPONENTS) {
		const v = shell && shell[c];
		out[c] = typeof v === "string" && VARIANT_RE.test(v) ? v : null;
	}
	return out;
}

function cleanValues(obj, keys) {
	const out = {};
	for (const k of keys) {
		if (obj && typeof obj[k] === "string" && obj[k]) out[k] = obj[k];
	}
	return out;
}

function cleanNames(list) {
	return Array.isArray(list) ? list.filter((n) => typeof n === "string" && n.length <= 140) : [];
}

function cleanPack(p) {
	if (!p || !isKey(p.key)) return null;
	return {
		key: p.key,
		title: typeof p.title === "string" ? p.title : p.key,
		description: typeof p.description === "string" ? p.description : "",
		audience: typeof p.audience === "string" ? p.audience : "",
		is_standard: Boolean(p.is_standard),
		shell: cleanShell(p.shell),
		custom_home: Boolean(p.custom_home),
		themes: cleanValues(p.themes, ["light", "dark"]),
		compatible_themes: Array.isArray(p.compatible_themes)
			? p.compatible_themes.filter((t) => typeof t === "string")
			: [],
		login: typeof p.login === "string" ? p.login : "",
		home: {
			cards: cleanNames(p.home && p.home.cards),
			charts: cleanNames(p.home && p.home.charts),
		},
		defaults: cleanValues(p.defaults, [...THEME_KEYS, ...LAYOUT_KEYS]),
		selection: cleanValues(p.selection, THEME_KEYS),
		layout: cleanValues(p.layout, LAYOUT_KEYS),
		overridden: Array.isArray(p.overridden) ? p.overridden.filter((k) => typeof k === "string") : [],
	};
}

/** Validate the payload's experience block; null when unusable. */
export function normaliseExperience(raw) {
	if (!raw || typeof raw !== "object" || !isKey(raw.key)) return null;
	const available = (Array.isArray(raw.available) ? raw.available : [])
		.map(cleanPack)
		.filter(Boolean);
	if (!available.some((p) => p.key === raw.key)) return null;
	return {
		key: raw.key,
		title: typeof raw.title === "string" ? raw.title : raw.key,
		source: raw.source || "site",
		shell: cleanShell(raw.shell),
		custom_home: Boolean(raw.custom_home),
		site_default: isKey(raw.site_default) ? raw.site_default : raw.key,
		allow_user_experience: Boolean(raw.allow_user_experience),
		theme_open: Boolean(raw.theme_open),
		layout_open: raw.layout_open && typeof raw.layout_open === "object" ? raw.layout_open : {},
		native_home_page: typeof raw.native_home_page === "string" ? raw.native_home_page : null,
		// False on a site that has not been migrated (no ui-home page yet).
		home_available: raw.home_available === undefined ? true : Boolean(raw.home_available),
		available,
	};
}

export function findPack(config, key) {
	return (config && config.available.find((p) => p.key === key)) || null;
}

/** The complete draft for a pack: its theme choices and layout values. */
export function draftFor(config, key) {
	const pack = findPack(config, key);
	if (!pack) return null;
	return { experience: key, ...pack.selection, ...pack.layout };
}

/** Which keys of a draft differ from the pack's own values (shown as "adjusted"). */
export function adjustedKeys(pack, draft) {
	if (!pack || !draft) return [];
	return [...THEME_KEYS, ...LAYOUT_KEYS].filter(
		(k) => pack.defaults[k] && draft[k] && draft[k] !== pack.defaults[k]
	);
}
