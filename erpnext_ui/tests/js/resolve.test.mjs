import { test } from "node:test";
import assert from "node:assert/strict";

import { buildThemeCss, isSafeValue, sanitiseTokens } from "../../public/js/theme/tokens.js";
import {
	normaliseConfig,
	resolveMode,
	resolveTheme,
	sanitisePreview,
	selectionFor,
} from "../../public/js/theme/resolve.js";
import { makeConfig, theme, TOKEN_NAMES } from "./helpers.mjs";

test("token values that could break out of the style rule are rejected", () => {
	for (const bad of [
		"red; } body { display:none",
		"url(javascript:x)",
		"a</style>",
		'"x"',
		"x/*",
		"",
		null,
		3,
	]) {
		assert.equal(isSafeValue(bad), false, String(bad));
	}
	for (const good of [
		"#294b70",
		"6px",
		"0 1px 2px 0px rgba(16, 24, 40, 0.06)",
		"none",
		"dark",
	]) {
		assert.equal(isSafeValue(good), true, good);
	}
});

test("sanitiseTokens drops unsafe pairs and reports missing tokens", () => {
	const { tokens, missing } = sanitiseTokens(
		{ primary: "#000000", surface: "red;}", "Bad Name": "#fff", text: "#111111" },
		["primary", "surface", "text"]
	);
	assert.deepEqual(tokens, { primary: "#000000", text: "#111111" });
	assert.deepEqual(missing, ["surface"]);
});

test("buildThemeCss writes one rule scoped to the theme key", () => {
	const css = buildThemeCss("classic-light", { primary: "#294b70", radius: "6px" });
	assert.equal(
		css,
		'html[data-ui-theme="classic-light"] { --ui-primary: #294b70; --ui-radius: 6px; }'
	);
	assert.throws(() => buildThemeCss('x"] body {', {}));
});

test("resolveMode handles light, dark and automatic", () => {
	assert.equal(resolveMode("Light", true), "light");
	assert.equal(resolveMode("Dark", false), "dark");
	assert.equal(resolveMode("Automatic", true), "dark");
	assert.equal(resolveMode("Automatic", false), "light");
	assert.equal(resolveMode("Nonsense", true), "light");
});

test("normaliseConfig: missing, disabled, empty catalog and server error", () => {
	assert.equal(normaliseConfig(undefined).enabled, false);
	assert.equal(normaliseConfig("text").reason, "missing");
	assert.equal(normaliseConfig({ enabled: 0 }).reason, "disabled");
	assert.equal(normaliseConfig({ enabled: 0, error: 1 }).reason, "server-error");
	assert.equal(normaliseConfig(makeConfig({ catalog: [] })).reason, "empty-catalog");
});

test("normaliseConfig replaces invalid values with defaults and drops bad themes", () => {
	const raw = makeConfig({
		appearance: "Sepia",
		density: "Huge",
		font: "Comic Sans",
		catalog: [
			theme("Classic Light", "Light"),
			{ name: "Bad", key: 'x" y', mode: "Light", tokens: {} },
		],
	});
	const config = normaliseConfig(raw);
	assert.equal(config.appearance, "Light");
	assert.equal(config.density, "Comfortable");
	assert.equal(config.font, "Inter");
	assert.deepEqual(
		config.catalog.map((t) => t.name),
		["Classic Light"]
	);
	assert.deepEqual(normaliseConfig(config), config, "normalising twice changes nothing");
});

test("resolveTheme uses the selection when valid", () => {
	const config = normaliseConfig(makeConfig({ light_theme: "Professional Blue" }));
	const out = resolveTheme(config, selectionFor(config), false);
	assert.equal(out.theme.name, "Professional Blue");
	assert.equal(out.mode, "light");
	assert.equal(out.fallback, false);
});

test("resolveTheme picks the dark slot in dark and automatic modes", () => {
	const config = normaliseConfig(
		makeConfig({ appearance: "Automatic", dark_theme: "Professional Dark" })
	);
	assert.equal(resolveTheme(config, selectionFor(config), true).theme.name, "Professional Dark");
	assert.equal(resolveTheme(config, selectionFor(config), false).theme.name, "Classic Light");
});

test("resolveTheme falls back for unknown, wrong-mode or incomplete themes", () => {
	const broken = theme("Broken Light", "Light");
	delete broken.tokens.surface;
	const config = normaliseConfig(
		makeConfig({
			light_theme: "Broken Light",
			defaults: { light_theme: "Missing" },
			catalog: [broken, ...makeConfig().catalog],
		})
	);
	const out = resolveTheme(config, selectionFor(config), false);
	assert.equal(out.theme.name, "Classic Light");
	assert.equal(out.fallback, true);

	const wrongMode = normaliseConfig(makeConfig({ light_theme: "Classic Dark" }));
	assert.equal(
		resolveTheme(wrongMode, selectionFor(wrongMode), false).theme.name,
		"Classic Light"
	);
});

test("resolveTheme falls back to any complete theme when Classic Light is missing", () => {
	const config = normaliseConfig(
		makeConfig({ light_theme: "Missing", catalog: [theme("Professional Blue", "Light")] })
	);
	assert.equal(
		resolveTheme(config, selectionFor(config), false).theme.name,
		"Professional Blue"
	);
});

test("resolveTheme returns null when no complete theme exists for the mode", () => {
	const config = normaliseConfig(
		makeConfig({ appearance: "Dark", catalog: [theme("Classic Light", "Light")] })
	);
	assert.equal(resolveTheme(config, selectionFor(config), false), null);
});

test("sanitisePreview keeps only valid overrides", () => {
	const out = sanitisePreview({
		appearance: "Dark",
		density: "Huge",
		font: "System UI",
		light_theme: "Soft Green",
		force_mode: "sepia",
		user: "admin",
		route: "ui-preferences",
	});
	assert.deepEqual(out, {
		appearance: "Dark",
		font: "System UI",
		light_theme: "Soft Green",
		route: "ui-preferences",
	});
});

test("TOKEN_NAMES fixture mirrors the shape the server sends", () => {
	assert.ok(TOKEN_NAMES.includes("primary"));
});
