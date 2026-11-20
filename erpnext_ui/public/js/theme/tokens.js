// Turning a theme's token map into CSS, with defensive validation.
// Values come from the server, which validates them already; they are checked
// again here because they end up inside a <style> element.

export const STYLE_ELEMENT_ID = "erpnext-ui-theme-tokens";

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TOKEN_RE = /^[a-z][a-z0-9-]{0,40}$/;
// No quotes, semicolons, braces, colons, slashes or angle brackets.
const VALUE_RE = /^[#a-zA-Z0-9(),.%\s-]{1,240}$/;

export function isSafeKey(key) {
	return typeof key === "string" && KEY_RE.test(key);
}

export function isSafeToken(name) {
	return typeof name === "string" && TOKEN_RE.test(name);
}

export function isSafeValue(value) {
	return typeof value === "string" && VALUE_RE.test(value);
}

/** Keep only safe token/value pairs and report required tokens that are missing. */
export function sanitiseTokens(tokens, required = []) {
	const clean = {};
	if (tokens && typeof tokens === "object") {
		for (const [name, value] of Object.entries(tokens)) {
			if (isSafeToken(name) && isSafeValue(value)) clean[name] = value.trim();
		}
	}
	const missing = required.filter((name) => !(name in clean));
	return { tokens: clean, missing };
}

export function buildThemeCss(key, tokens) {
	if (!isSafeKey(key)) throw new Error(`unsafe theme key: ${key}`);
	const body = Object.entries(tokens)
		.filter(([name, value]) => isSafeToken(name) && isSafeValue(value))
		.map(([name, value]) => `--ui-${name}: ${value};`)
		.join(" ");
	return `html[data-ui-theme="${key}"] { ${body} }`;
}
