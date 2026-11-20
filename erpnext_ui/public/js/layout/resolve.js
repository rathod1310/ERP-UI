// Pure layout resolution, mirroring erpnext_ui/theme/layouts.py. The server
// sends the effective layout and the registry; this module is used to preview
// other choices without a request. No DOM, no frappe globals.

// Layout category -> attribute on <html> (values are the registry's attribute names).
export const ATTRIBUTES = {
	navigation: "data-ui-nav",
	workspace_format: "data-ui-workspace",
	form_format: "data-ui-form",
	list_format: "data-ui-list",
	content_width: "data-ui-width",
	card_style: "data-ui-cards",
	page_background: "data-ui-canvas",
};
export const LAYOUT_KEYS = Object.keys(ATTRIBUTES);
export const SELECTION_KEYS = ["layout_preset", ...LAYOUT_KEYS];

const ATTR_RE = /^[a-z][a-z-]{0,30}$/;

function isRegistry(r) {
	return (
		r &&
		Array.isArray(r.presets) &&
		Array.isArray(r.categories) &&
		r.categories.every(
			(c) => typeof c.key === "string" && Array.isArray(c.options) && c.options.length
		)
	);
}

/** Validate the payload's layout block. Unusable input disables the layout. */
export function normaliseLayoutConfig(raw) {
	if (!raw || typeof raw !== "object") return { enabled: false };
	if (!raw.enabled || !isRegistry(raw.registry)) return { enabled: false };
	const registry = raw.registry;
	const categories = {};
	for (const c of registry.categories) {
		if (!(c.key in ATTRIBUTES)) continue;
		const options = c.options.filter(
			(o) => typeof o.value === "string" && ATTR_RE.test(o.attribute || "")
		);
		if (options.length) categories[c.key] = { ...c, options };
	}
	if (LAYOUT_KEYS.some((k) => !categories[k])) return { enabled: false };
	const presets = {};
	for (const p of registry.presets) {
		if (p && typeof p.name === "string" && p.values) presets[p.name] = p;
	}
	const defaultPreset = presets[registry.default_preset]
		? registry.default_preset
		: Object.keys(presets)[0];
	if (!defaultPreset) return { enabled: false };
	const defaults = raw.defaults && typeof raw.defaults === "object" ? raw.defaults : {};
	const config = {
		enabled: true,
		categories,
		presets,
		groups: registry.groups || {},
		defaultPreset,
		allowed: raw.allowed && typeof raw.allowed === "object" ? raw.allowed : {},
		defaults: {
			preset: presets[defaults.preset] ? defaults.preset : defaultPreset,
			values: defaults.values && typeof defaults.values === "object" ? defaults.values : {},
		},
		saved: raw.saved && typeof raw.saved === "object" ? raw.saved : {},
	};
	// The effective layout is recomputed locally so it is always valid.
	config.current = resolveLayout(config, config.saved);
	return config;
}

export function isValid(config, key, value) {
	if (key === "layout_preset") return Boolean(config.presets[value]);
	const c = config.categories[key];
	return Boolean(c && c.options.some((o) => o.value === value));
}

export function groupOf(config, key) {
	return key === "layout_preset" ? "layout_preset" : config.categories[key].group;
}

export function attributeFor(config, key, value) {
	const option = config.categories[key].options.find((o) => o.value === value);
	return option ? option.attribute : config.categories[key].options[0].attribute;
}

/**
 * Effective layout for a user selection ({layout_preset, navigation, ...}).
 * Same order as the server: user value > user preset > site value > site preset.
 */
export function resolveLayout(config, selection = {}, { ignoreAllowed = false } = {}) {
	const allowed = (group) => ignoreAllowed || Boolean(config.allowed[group]);
	const userPreset =
		allowed("layout_preset") && isValid(config, "layout_preset", selection.layout_preset)
			? selection.layout_preset
			: null;
	const preset = userPreset || config.defaults.preset;
	const presetValues = config.presets[preset].values;
	const values = {};
	const sources = {};
	for (const key of LAYOUT_KEYS) {
		const user = selection[key];
		const site = config.defaults.values[key];
		if (allowed(groupOf(config, key)) && isValid(config, key, user)) {
			values[key] = user;
			sources[key] = "user";
		} else if (!userPreset && isValid(config, key, site)) {
			values[key] = site;
			sources[key] = "site";
		} else {
			values[key] = isValid(config, key, presetValues[key])
				? presetValues[key]
				: config.categories[key].options[0].value;
			sources[key] = "preset";
		}
	}
	const attributes = {};
	for (const key of LAYOUT_KEYS) attributes[key] = attributeFor(config, key, values[key]);
	return { preset, matches: matchingPreset(config, values, preset), values, sources, attributes };
}

/** The preset whose values equal `values` (preferring `preferred`), or null. */
export function matchingPreset(config, values, preferred) {
	const equal = (name) => LAYOUT_KEYS.every((k) => config.presets[name].values[k] === values[k]);
	if (preferred && config.presets[preferred] && equal(preferred)) return preferred;
	return Object.keys(config.presets).find(equal) || null;
}

/** A selection that applies a whole preset: the preset, every category cleared. */
export function presetSelection(name) {
	const selection = { layout_preset: name };
	for (const key of LAYOUT_KEYS) selection[key] = "";
	return selection;
}
