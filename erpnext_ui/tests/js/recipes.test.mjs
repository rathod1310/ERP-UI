// Phase 3 M2: theme recipes on <html> (data-ui-t-*) and the backdrop switches.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ThemeEngine } from "../../public/js/theme/engine.js";
import { RECIPE_ATTRIBUTES, sanitiseRecipe, FALLBACK_THEMES } from "../../public/js/theme/resolve.js";
import { FakeDocument, FakeRoot, makeConfig, theme } from "./helpers.mjs";

const adapter = { key: "v16", detect: () => true, install() {} };
const CORPORATE = {
	sidebar: "gradient",
	navbar: "solid",
	surface: "bordered",
	input: "outlined",
	table: "lined",
	button: "rounded",
	backdrop: "geometric",
	heading: "body",
	numerals: "proportional",
};

function withRecipe(entry, recipe) {
	return { ...entry, recipe };
}

function catalog() {
	return [
		withRecipe(theme("Classic Light", "Light"), CORPORATE),
		withRecipe(theme("Professional Blue", "Light", "#1d5fa8"), { ...CORPORATE, sidebar: "floating", backdrop: "mesh", button: "pill" }),
		withRecipe(theme("Classic Dark", "Dark"), { ...CORPORATE, sidebar: "attached", numerals: "mono", backdrop: "glow" }),
	];
}

function makeEngine(overrides = {}) {
	const root = new FakeRoot();
	const engine = new ThemeEngine({ root, doc: new FakeDocument(root) });
	engine.init(makeConfig({ catalog: catalog(), ...overrides }), adapter);
	return { root, engine };
}

const recipeOf = (root) =>
	Object.fromEntries(RECIPE_ATTRIBUTES.map((n) => [n, root.getAttribute(`data-ui-t-${n}`)]));

test("the collection's fallbacks are Corporate Blue and Graphite Dark", () => {
	assert.deepEqual(FALLBACK_THEMES, { Light: "Corporate Blue", Dark: "Graphite Dark" });
});

test("the active theme's recipe is written to data-ui-t-*", () => {
	const { root } = makeEngine();
	assert.deepEqual(recipeOf(root), CORPORATE);
	assert.equal(root.getAttribute("data-ui-backdrop-through"), null);
});

test("switching theme switches the recipe without a reload", () => {
	const { root, engine } = makeEngine();
	engine.update(makeConfig({ catalog: catalog(), light_theme: "Professional Blue" }));
	assert.equal(root.getAttribute("data-ui-t-sidebar"), "floating");
	assert.equal(root.getAttribute("data-ui-t-button"), "pill");
	engine.update(makeConfig({ catalog: catalog(), appearance: "Dark" }));
	assert.equal(root.getAttribute("data-ui-t-numerals"), "mono");
	assert.equal(root.getAttribute("data-ui-t-sidebar"), "attached");
});

test("previewing a theme previews its recipe; ending restores it", () => {
	const { root, engine } = makeEngine();
	engine.preview({ light_theme: "Professional Blue" });
	assert.equal(root.getAttribute("data-ui-t-backdrop"), "mesh");
	engine.endPreview();
	assert.equal(root.getAttribute("data-ui-t-backdrop"), "geometric");
});

test("backdrops switched off by the administrator become none", () => {
	const { root } = makeEngine({ backdrops: { enabled: 0, through_panels: 1 } });
	assert.equal(root.getAttribute("data-ui-t-backdrop"), "none");
	assert.equal(root.getAttribute("data-ui-backdrop-through"), null);
});

test("through panels is set only when the theme has a backdrop", () => {
	const { root } = makeEngine({ backdrops: { enabled: 1, through_panels: 1 } });
	assert.equal(root.getAttribute("data-ui-backdrop-through"), "1");
	const plain = makeEngine({
		backdrops: { enabled: 1, through_panels: 1 },
		catalog: [withRecipe(theme("Classic Light", "Light"), { ...CORPORATE, backdrop: "none" }), ...catalog().slice(1)],
	});
	assert.equal(plain.root.getAttribute("data-ui-backdrop-through"), null);
});

test("a theme without a recipe (older payload) sets no recipe attributes", () => {
	const { root } = makeEngine({ catalog: [theme("Classic Light", "Light"), theme("Classic Dark", "Dark")] });
	assert.deepEqual(recipeOf(root), Object.fromEntries(RECIPE_ATTRIBUTES.map((n) => [n, null])));
});

test("unsafe or unknown recipe values are dropped", () => {
	assert.deepEqual(sanitiseRecipe({ sidebar: 'x"]{}', table: "zebra", evil: "yes", button: "PILL" }), {
		table: "zebra",
	});
	assert.deepEqual(sanitiseRecipe(null), {});
});

test("deactivation removes every recipe attribute", () => {
	const { root, engine } = makeEngine({ backdrops: { enabled: 1, through_panels: 1 } });
	engine.update(makeConfig({ enabled: 0 }));
	for (const name of RECIPE_ATTRIBUTES) assert.equal(root.getAttribute(`data-ui-t-${name}`), null, name);
	assert.equal(root.getAttribute("data-ui-backdrop-through"), null);
});
