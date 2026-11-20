import { test } from "node:test";
import assert from "node:assert/strict";

import { ThemeEngine, EVENTS } from "../../public/js/theme/engine.js";
import { STYLE_ELEMENT_ID } from "../../public/js/theme/tokens.js";
import { fakeAdapter, makeConfig, makeEnv, tick } from "./helpers.mjs";

function start(configOverrides = {}, envOptions = {}, adapter = fakeAdapter) {
	const env = makeEnv(envOptions);
	const engine = new ThemeEngine(env.deps);
	engine.init(makeConfig(configOverrides), adapter);
	return { engine, ...env };
}

test("initialisation applies the theme and all attributes", () => {
	const { engine, root, doc } = start();
	assert.equal(engine.active, true);
	assert.equal(root.getAttribute("data-ui-theme"), "classic-light");
	assert.equal(root.getAttribute("data-ui-mode"), "light");
	assert.equal(root.getAttribute("data-ui-density"), "comfortable");
	assert.equal(root.getAttribute("data-ui-font"), "inter");
	assert.equal(root.getAttribute("data-ui-adapter"), "v16");
	assert.equal(root.getAttribute("data-theme"), "light");
	const style = doc.getElementById(STYLE_ELEMENT_ID);
	assert.match(
		style.textContent,
		/^html\[data-ui-theme="classic-light"\] \{ --ui-primary: #294b70;/
	);
	assert.equal(doc.events.at(-1).type, EVENTS.applied);
});

test("CSS variables for the active theme only are written", () => {
	const { doc } = start({ light_theme: "Professional Blue" });
	const css = doc.getElementById(STYLE_ELEMENT_ID).textContent;
	assert.match(css, /--ui-primary: #1d5fa8/);
	assert.doesNotMatch(css, /classic-light/);
});

test("duplicate initialisation is ignored and creates no second style element", () => {
	const { engine, doc } = start();
	assert.equal(
		engine.init(makeConfig({ light_theme: "Professional Blue" }), fakeAdapter),
		false
	);
	assert.equal(doc.styleElements().length, 1);
	assert.equal(engine.current.theme, "Classic Light");
	assert.equal(engine.applyCount, 1);
});

test("dark mode applies the dark slot and Frappe's data-theme", () => {
	const { root, engine } = start({ appearance: "Dark", dark_theme: "Professional Dark" });
	assert.equal(engine.current.theme, "Professional Dark");
	assert.equal(root.getAttribute("data-theme"), "dark");
	assert.equal(root.getAttribute("data-theme-mode"), "dark");
});

test("automatic mode follows the operating system and its changes", async () => {
	const { root, engine, media } = start({ appearance: "Automatic" }, { prefersDark: true });
	assert.equal(engine.current.theme, "Classic Dark");
	assert.equal(root.getAttribute("data-theme-mode"), "automatic");
	media.set(false);
	assert.equal(engine.current.theme, "Classic Light");
	assert.equal(root.getAttribute("data-theme"), "light");
	media.set(true);
	assert.equal(root.getAttribute("data-theme"), "dark");
});

test("OS changes are ignored when the appearance is fixed", () => {
	const { engine, media } = start({ appearance: "Light" });
	const before = engine.applyCount;
	media.set(true);
	assert.equal(engine.applyCount, before);
});

test("switching themes via update() needs no reload and reuses the style element", () => {
	const { engine, root, doc } = start();
	engine.update(
		makeConfig({ light_theme: "Professional Blue", density: "Compact", font: "System UI" })
	);
	assert.equal(root.getAttribute("data-ui-theme"), "professional-blue");
	assert.equal(root.getAttribute("data-ui-density"), "compact");
	assert.equal(root.getAttribute("data-ui-font"), "system");
	assert.equal(doc.styleElements().length, 1);
});

test("following Frappe's own Toggle Theme dialog (data-theme-mode)", async () => {
	const { engine, root } = start();
	root.setAttribute("data-theme-mode", "dark"); // what frappe.ui.ThemeSwitcher does
	await tick();
	assert.equal(engine.current.theme, "Classic Dark");
	assert.equal(engine.config.appearance, "Dark");
	assert.equal(root.getAttribute("data-theme"), "dark");
});

test("the engine's own attribute writes do not loop through the observer", async () => {
	const { engine } = start({ appearance: "Automatic" });
	const count = engine.applyCount;
	await tick();
	await tick();
	assert.equal(engine.applyCount, count);
});

test("preview applies temporarily and endPreview restores the saved selection", () => {
	const { engine, root } = start();
	engine.preview({ light_theme: "Professional Blue", density: "Spacious" });
	assert.equal(root.getAttribute("data-ui-theme"), "professional-blue");
	assert.equal(root.getAttribute("data-ui-preview"), "1");
	assert.equal(engine.config.light_theme, "Classic Light", "saved config untouched");
	engine.endPreview();
	assert.equal(root.getAttribute("data-ui-theme"), "classic-light");
	assert.equal(root.getAttribute("data-ui-density"), "comfortable");
	assert.equal(root.hasAttribute("data-ui-preview"), false);
});

test("forced-mode preview shows a dark theme without changing data-theme-mode", () => {
	const { engine, root } = start();
	engine.preview({ dark_theme: "Professional Dark", force_mode: "dark" });
	assert.equal(engine.current.theme, "Professional Dark");
	assert.equal(root.getAttribute("data-theme"), "dark");
	assert.equal(root.getAttribute("data-theme-mode"), "light");
});

test("route navigation ends a route-scoped preview and keeps the theme", () => {
	const { engine, root } = start();
	engine.preview({ light_theme: "Professional Blue", route: "ui-preferences" });
	engine.onRouteChange("ui-preferences");
	assert.equal(engine.isPreviewing, true);
	engine.onRouteChange("List/Customer");
	assert.equal(engine.isPreviewing, false);
	assert.equal(root.getAttribute("data-ui-theme"), "classic-light");
});

test("route navigation re-applies attributes if something removed them", () => {
	const { engine, root } = start();
	root.removeAttribute("data-ui-adapter");
	engine.onRouteChange("List/Item");
	assert.equal(root.getAttribute("data-ui-adapter"), "v16");
});

test("missing configuration leaves the native Desk untouched", () => {
	const { engine, root, doc } = start({}, {}, fakeAdapter);
	const env = makeEnv();
	const inactive = new ThemeEngine(env.deps);
	inactive.init(undefined, fakeAdapter);
	assert.equal(inactive.active, false);
	assert.equal(inactive.reason, "missing");
	assert.equal(env.root.hasAttribute("data-ui-adapter"), false);
	assert.equal(env.doc.getElementById(STYLE_ELEMENT_ID), null);
	assert.equal(
		env.root.getAttribute("data-theme"),
		"light",
		"Frappe's attribute is not touched"
	);
	assert.ok(engine && root && doc);
});

test("unsupported version (no adapter) stays inactive", () => {
	const env = makeEnv();
	const engine = new ThemeEngine(env.deps);
	engine.init(makeConfig(), null);
	assert.equal(engine.active, false);
	assert.equal(engine.reason, "unsupported-version");
	assert.equal(env.root.hasAttribute("data-ui-theme"), false);
});

test("invalid selected theme falls back to Classic Light", () => {
	const { engine } = start({ light_theme: "Deleted Theme" });
	assert.equal(engine.current.theme, "Classic Light");
	assert.equal(engine.current.fallback, true);
});

test("no usable theme deactivates instead of half-applying", () => {
	const env = makeEnv();
	const engine = new ThemeEngine(env.deps);
	const config = makeConfig({ appearance: "Dark" });
	config.catalog = config.catalog.filter((t) => t.mode === "Light");
	engine.init(config, fakeAdapter);
	assert.equal(engine.active, false);
	assert.equal(engine.reason, "no-valid-theme");
	assert.equal(env.root.hasAttribute("data-ui-adapter"), false);
});

test("disabling through update() removes everything the engine added", () => {
	const { engine, root, doc } = start();
	engine.update({ enabled: 0 });
	assert.equal(engine.active, false);
	for (const name of [
		"data-ui-adapter",
		"data-ui-theme",
		"data-ui-mode",
		"data-ui-density",
		"data-ui-font",
	]) {
		assert.equal(root.hasAttribute(name), false, name);
	}
	assert.equal(doc.getElementById(STYLE_ELEMENT_ID), null);
	assert.equal(doc.events.at(-1).type, EVENTS.deactivated);
});

test("re-enabling after disable works and listeners are not duplicated", () => {
	const { engine, media, root } = start({ appearance: "Automatic" });
	engine.update({ enabled: 0 });
	engine.update(makeConfig({ appearance: "Automatic" }));
	assert.equal(media.listeners.size, 1);
	assert.equal(root.observers.length, 1);
	assert.equal(engine.active, true);
});

test("destroy disconnects observers and media listeners", () => {
	const { engine, media, root } = start({ appearance: "Automatic" });
	engine.destroy();
	assert.equal(media.listeners.size, 0);
	assert.equal(root.observers.length, 0);
	assert.equal(engine.initialized, false);
});

test("works without matchMedia or MutationObserver (old browsers)", () => {
	const env = makeEnv();
	const engine = new ThemeEngine({ ...env.deps, matchMedia: null, MutationObserver: undefined });
	engine.init(makeConfig({ appearance: "Automatic" }), fakeAdapter);
	assert.equal(engine.active, true);
	assert.equal(engine.current.mode, "light");
});

test("an appearance chosen in Frappe's dialog is reported for saving, once", async () => {
	const { engine, root } = start();
	const reported = [];
	engine.onAppearanceChange = (a) => reported.push(a);
	root.setAttribute("data-theme-mode", "automatic");
	await tick();
	engine.update(makeConfig({ appearance: "Dark" })); // engine's own write: not reported
	await tick();
	assert.deepEqual(reported, ["Automatic"]);
});
