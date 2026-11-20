// Phase 3 milestone 1: layout resolution (shared cases with the Python tests),
// the layout engine and its independence from the theme engine. The
// customization session and preview bar are tested in experience.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
	normaliseLayoutConfig,
	resolveLayout,
	presetSelection,
	LAYOUT_KEYS,
	ATTRIBUTES,
} from "../../public/js/layout/resolve.js";
import { LayoutEngine, LAYOUT_ATTRIBUTES } from "../../public/js/layout/engine.js";
import { ThemeEngine } from "../../public/js/theme/engine.js";
import { pick } from "../../public/js/preferences/client.js";
import { FakeCustomEvent, FakeDocument, FakeRoot, makeConfig } from "./helpers.mjs";

// The same registry and cases are checked against theme/layouts.py in
// tests/test_layouts.py, so the two resolvers cannot drift apart.
const FIXTURE = JSON.parse(
	readFileSync(new URL("../layout_cases.json", import.meta.url), "utf8")
);
const ALL_OPEN = Object.fromEntries(Object.keys(FIXTURE.registry.groups).map((g) => [g, true]));

function layoutPayload({ preset, values = {}, allowed = ALL_OPEN, saved = {}, enabled = 1 } = {}) {
	return {
		enabled,
		registry: FIXTURE.registry,
		allowed,
		defaults: { preset: preset || FIXTURE.registry.default_preset, values },
		saved,
	};
}

// ------------------------------------------------------------ resolution

for (const c of FIXTURE.cases) {
	test(`resolution matches the server: ${c.name}`, () => {
		const i = c.input;
		const config = normaliseLayoutConfig(
			layoutPayload({ preset: i.site_preset, values: i.site_values, allowed: i.allowed || {} })
		);
		const selection = { layout_preset: i.user_preset, ...(i.user_values || {}) };
		const r = resolveLayout(config, selection);
		assert.deepEqual(
			{ preset: r.preset, matches: r.matches, values: r.values, sources: r.sources, attributes: r.attributes },
			c.expected
		);
	});
}

test("normaliseLayoutConfig: missing, disabled or broken payloads turn the layout off", () => {
	assert.equal(normaliseLayoutConfig(undefined).enabled, false);
	assert.equal(normaliseLayoutConfig(layoutPayload({ enabled: 0 })).enabled, false);
	const broken = layoutPayload();
	broken.registry = { ...broken.registry, categories: broken.registry.categories.slice(1) };
	assert.equal(normaliseLayoutConfig(broken).enabled, false);
});

test("normaliseLayoutConfig drops options with unsafe attribute values", () => {
	const raw = layoutPayload();
	raw.registry = JSON.parse(JSON.stringify(raw.registry));
	raw.registry.categories[0].options.push({ value: "Evil", attribute: '"><script>', description: "" });
	const config = normaliseLayoutConfig(raw);
	assert.ok(config.enabled);
	assert.ok(!config.categories.navigation.options.some((o) => o.value === "Evil"));
});

test("presetSelection clears every category", () => {
	const s = presetSelection("Compact");
	assert.equal(s.layout_preset, "Compact");
	for (const key of LAYOUT_KEYS) assert.equal(s[key], "");
});

// ------------------------------------------------------------ layout engine

function makeEngines(layoutRaw = layoutPayload(), themeConfig = makeConfig()) {
	const root = new FakeRoot();
	const doc = new FakeDocument(root);
	const navigation = [];
	const adapter = {
		key: "v16",
		detect: () => true,
		install() {},
		applyNavigation: (mode) => navigation.push(mode),
	};
	const theme = new ThemeEngine({ root, doc, CustomEvent: FakeCustomEvent });
	theme.init(themeConfig, adapter);
	const layout = new LayoutEngine({ root, doc, CustomEvent: FakeCustomEvent });
	layout.init(layoutRaw, adapter);
	return { root, doc, theme, layout, adapter, navigation };
}

const attrs = (root) =>
	Object.fromEntries(LAYOUT_ATTRIBUTES.map((a) => [a, root.getAttribute(a)]));

test("the layout engine sets one attribute per category (Modern = Phase 2 Desk)", () => {
	const { root, layout } = makeEngines();
	assert.equal(layout.current.preset, "Modern");
	assert.deepEqual(attrs(root), {
		"data-ui-layout": "enhanced",
		"data-ui-nav": "standard",
		"data-ui-workspace": "standard",
		"data-ui-form": "standard",
		"data-ui-list": "standard",
		"data-ui-width": "standard",
		"data-ui-cards": "bordered",
		"data-ui-canvas": "tinted",
		"data-ui-layout-preview": null,
	});
});

test("every preset applies its own attributes", () => {
	for (const preset of FIXTURE.registry.presets) {
		const { root, layout } = makeEngines(layoutPayload({ saved: { layout_preset: preset.name } }));
		assert.equal(layout.current.preset, preset.name);
		for (const key of LAYOUT_KEYS) {
			const category = FIXTURE.registry.categories.find((c) => c.key === key);
			const option = category.options.find((o) => o.value === preset.values[key]);
			assert.equal(root.getAttribute(ATTRIBUTES[key]), option.attribute, `${preset.name} ${key}`);
		}
	}
});

test("theme and layout are independent: any theme with any preset", () => {
	for (const themeName of ["Classic Light", "Professional Blue", "Professional Dark", "Classic Dark"]) {
		for (const preset of ["Classic", "Modern", "Compact", "Wide"]) {
			const mode = themeName.includes("Dark") ? "Dark" : "Light";
			const { root, theme, layout } = makeEngines(
				layoutPayload({ saved: { layout_preset: preset } }),
				makeConfig({
					appearance: mode,
					[mode === "Dark" ? "dark_theme" : "light_theme"]: themeName,
				})
			);
			assert.equal(theme.current.theme, themeName);
			assert.equal(layout.current.preset, preset);
			assert.equal(root.getAttribute("data-ui-adapter"), "v16");
		}
	}
});

test("switching the theme leaves the layout untouched, and the other way round", () => {
	const { root, theme, layout } = makeEngines(layoutPayload({ saved: { layout_preset: "Compact" } }));
	theme.update(makeConfig({ light_theme: "Professional Blue" }));
	assert.equal(root.getAttribute("data-ui-nav"), "compact");
	layout.update(layoutPayload({ saved: { layout_preset: "Wide" } }));
	assert.equal(root.getAttribute("data-ui-theme"), "professional-blue");
	assert.equal(root.getAttribute("data-ui-nav"), "collapsed");
});

test("layout preview: applies, survives anything but endPreview/update, and restores", () => {
	const { root, layout } = makeEngines();
	layout.preview({ layout_preset: "Wide" });
	assert.equal(root.getAttribute("data-ui-layout-preview"), "1");
	assert.equal(root.getAttribute("data-ui-width"), "full");
	assert.equal(layout.isPreviewing, true);
	layout.endPreview();
	assert.deepEqual(
		[root.getAttribute("data-ui-width"), root.getAttribute("data-ui-layout-preview")],
		["standard", null]
	);
});

test("navigation mode is passed to the adapter only when it changes", () => {
	const { layout, navigation } = makeEngines();
	assert.deepEqual(navigation, ["standard"]);
	layout.preview({ form_format: "Compact" });
	assert.deepEqual(navigation, ["standard"]);
	layout.preview({ layout_preset: "Wide" });
	layout.endPreview();
	assert.deepEqual(navigation, ["standard", "collapsed", "standard"]);
});

test("a layout disabled by the administrator removes every layout attribute", () => {
	const { root, layout } = makeEngines(layoutPayload({ saved: { layout_preset: "Wide" } }));
	layout.update(layoutPayload({ enabled: 0 }));
	assert.equal(layout.active, false);
	for (const name of LAYOUT_ATTRIBUTES) assert.equal(root.getAttribute(name), null, name);
	assert.equal(root.getAttribute("data-ui-adapter"), "v16", "theme stays");
});

test("without an adapter (unsupported Frappe) the layout never activates", () => {
	const root = new FakeRoot();
	const layout = new LayoutEngine({ root, doc: new FakeDocument(root) });
	layout.init(layoutPayload(), null);
	assert.equal(layout.active, false);
	assert.equal(root.getAttribute("data-ui-layout"), null);
});

test("closed categories cannot be previewed past the administrator's choice", () => {
	const { root, layout } = makeEngines(layoutPayload({ allowed: { ...ALL_OPEN, forms: false } }));
	layout.preview({ form_format: "Compact", list_format: "Compact" });
	assert.equal(root.getAttribute("data-ui-form"), "standard");
	assert.equal(root.getAttribute("data-ui-list"), "compact");
});

test("client pick(): theme keys only when set, layout keys also when cleared", () => {
	assert.deepEqual(pick({ experience: "modern-business", light_theme: "", density: "Compact", form_format: "", navigation: "Collapsed", layout_preset: "Wide" }), {
		experience: "modern-business",
		density: "Compact",
		form_format: "",
		navigation: "Collapsed",
	});
});
