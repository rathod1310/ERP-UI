// Phase 3 M3: the experience block, the experience engine (attributes and the
// per-user home route), the customization session (experience + adjustments,
// previewed through all three engines), the preview bar and the sketches.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
	normaliseExperience,
	draftFor,
	adjustedKeys,
	SHELL_ATTRIBUTES,
	HOME_PAGE,
} from "../../public/js/experience/resolve.js";
import { ExperienceEngine, EXPERIENCE_ATTRIBUTES } from "../../public/js/experience/engine.js";
import { LayoutEngine } from "../../public/js/layout/engine.js";
import { ThemeEngine } from "../../public/js/theme/engine.js";
import { CustomizationSession, SESSION_EVENT } from "../../public/js/customize/session.js";
import { PreviewBar } from "../../public/js/customize/preview-bar.js";
import { sketchHtml } from "../../public/js/configuration/sketch.js";
import { FakeCustomEvent, FakeDocument, FakeRoot, makeConfig } from "./helpers.mjs";

const FIXTURE = JSON.parse(readFileSync(new URL("../layout_cases.json", import.meta.url), "utf8"));

const LAYOUT_STANDARD = {
	navigation: "Standard",
	workspace_format: "Standard",
	form_format: "Standard",
	list_format: "Standard",
	content_width: "Standard",
	card_style: "Bordered",
	page_background: "Tinted",
};

function packEntry(key, overrides = {}) {
	const base = {
		key,
		title: key,
		description: `${key} description`,
		shell: { nav: "structured", header: "classic", launcher: "none", home: "workspace", form: "bands", list: "lined", report: "traditional" },
		custom_home: 0,
		themes: { light: "Classic Light", dark: "Classic Dark" },
		home: { cards: [], charts: [] },
		defaults: { light_theme: "Classic Light", dark_theme: "Classic Dark", density: "Comfortable", font: "Inter", ...LAYOUT_STANDARD },
		selection: { light_theme: "Classic Light", dark_theme: "Classic Dark", density: "Comfortable", font: "Inter" },
		layout: { ...LAYOUT_STANDARD },
		overridden: [],
	};
	return { ...base, ...overrides };
}

const HUB = packEntry("application-hub", {
	shell: { nav: "app-rail", header: "search", launcher: "full", home: "hub", form: "standard", list: "status-tabs", report: "traditional" },
	custom_home: 1,
	selection: { light_theme: "Professional Blue", dark_theme: "Professional Dark", density: "Compact", font: "Inter" },
	layout: { ...LAYOUT_STANDARD, navigation: "Compact", card_style: "Minimal" },
});

function experiencePayload(extra = {}) {
	return {
		key: "classic-business",
		title: "Classic Business",
		source: "site",
		shell: packEntry("x").shell,
		custom_home: 0,
		site_default: "classic-business",
		allow_user_experience: 1,
		theme_open: 1,
		layout_open: { navigation: true, workspace: true, forms: true, lists: true, content: true },
		native_home_page: "workspace",
		available: [packEntry("classic-business"), HUB],
		...extra,
	};
}

function layoutPayload(values = LAYOUT_STANDARD) {
	return {
		enabled: 1,
		registry: FIXTURE.registry,
		allowed: {},
		defaults: { preset: FIXTURE.registry.default_preset, values },
		saved: {},
	};
}

function makeEngines() {
	const root = new FakeRoot();
	const doc = new FakeDocument(root);
	const adapter = { key: "v16", detect: () => true, install() {}, applyNavigation() {} };
	const theme = new ThemeEngine({ root, doc, CustomEvent: FakeCustomEvent });
	theme.init(makeConfig(), adapter);
	const layout = new LayoutEngine({ root, doc, CustomEvent: FakeCustomEvent });
	layout.init(layoutPayload(), adapter);
	const boot = { home_page: "workspace" };
	const homeCalls = [];
	const experience = new ExperienceEngine({ root, doc, CustomEvent: FakeCustomEvent, boot, goHome: () => homeCalls.push("home") });
	experience.init(experiencePayload());
	return { root, doc, theme, layout, experience, boot, homeCalls };
}

// ------------------------------------------------------------ resolve

test("normaliseExperience validates keys and variants and drops bad packs", () => {
	const cfg = normaliseExperience(
		experiencePayload({
			available: [
				packEntry("classic-business"),
				{ ...HUB, shell: { ...HUB.shell, nav: "<script>" } },
				{ key: "Bad Key" },
				null,
			],
		})
	);
	assert.deepEqual(cfg.available.map((p) => p.key), ["classic-business", "application-hub"]);
	assert.equal(cfg.available[1].shell.nav, null, "unsafe variant dropped");
	assert.equal(normaliseExperience({ key: "missing", available: [] }), null);
	assert.equal(normaliseExperience(null), null);
});

test("draftFor gives the pack's whole selection; adjustedKeys compares with its defaults", () => {
	const cfg = normaliseExperience(experiencePayload());
	const draft = draftFor(cfg, "application-hub");
	assert.equal(draft.experience, "application-hub");
	assert.equal(draft.light_theme, "Professional Blue");
	assert.equal(draft.navigation, "Compact");
	assert.deepEqual(adjustedKeys(cfg.available[1], draft).sort(), ["card_style", "dark_theme", "density", "light_theme", "navigation"]);
	assert.equal(draftFor(cfg, "nope"), null);
});

// ------------------------------------------------------------ engine

test("the experience engine marks <html> with the pack and its component variants", () => {
	const { root } = makeEngines();
	assert.equal(root.getAttribute("data-ui-x"), "classic-business");
	assert.equal(root.getAttribute(SHELL_ATTRIBUTES.nav), "structured");
	assert.equal(root.getAttribute(SHELL_ATTRIBUTES.home), "workspace");
	assert.equal(root.getAttribute("data-ui-x-preview"), null);
});

test("preview switches attributes and the home route; endPreview restores both", () => {
	const { root, experience, boot } = makeEngines();
	experience.preview("application-hub");
	assert.equal(root.getAttribute(SHELL_ATTRIBUTES.home), "hub");
	assert.equal(root.getAttribute("data-ui-x-preview"), "1");
	assert.equal(boot.home_page, HOME_PAGE);
	experience.endPreview();
	assert.equal(root.getAttribute(SHELL_ATTRIBUTES.home), "workspace");
	assert.equal(boot.home_page, "workspace");
});

test("update() keeps the native home page from boot (API responses do not carry it)", () => {
	const { experience, boot } = makeEngines();
	const raw = experiencePayload({ key: "application-hub", native_home_page: undefined });
	experience.update(raw);
	assert.equal(boot.home_page, HOME_PAGE);
	experience.update(experiencePayload({ native_home_page: undefined }));
	assert.equal(boot.home_page, "workspace");
});

test("Frappe's launcher route leads to the experience home only while that home is active", () => {
	const { experience, homeCalls } = makeEngines();
	assert.equal(experience.onRouteChange(["workspace"]), false, "classic sample has no own home");
	experience.preview("application-hub");
	assert.equal(experience.onRouteChange(["workspace"]), true, "launcher route sends the user home");
	assert.equal(experience.onRouteChange(["List", "Sales Invoice"]), false, "other routes untouched");
	assert.equal(experience.onRouteChange([""]), false);
	experience.endPreview();
	assert.equal(experience.onRouteChange(["workspace"]), false);
	experience.update(experiencePayload({ key: "application-hub", home_available: 0 }));
	assert.equal(experience.onRouteChange(["workspace"]), false, "never on a site without the home page");
	assert.deepEqual(homeCalls, ["home"]);
});

test("without the ui-home page (site not migrated) the native home is kept", () => {
	const { experience, boot } = makeEngines();
	experience.update(experiencePayload({ key: "application-hub", home_available: 0 }));
	assert.equal(boot.home_page, "workspace");
	experience.preview("application-hub");
	assert.equal(boot.home_page, "workspace");
});

test("deactivate removes every attribute and gives the native home back", () => {
	const { root, experience, boot } = makeEngines();
	experience.preview("application-hub");
	experience.deactivate();
	for (const name of EXPERIENCE_ATTRIBUTES) assert.equal(root.getAttribute(name), null, name);
	assert.equal(boot.home_page, "workspace");
});

test("a bad payload deactivates the engine", () => {
	const { root, experience } = makeEngines();
	experience.update({ key: "x", available: [] });
	assert.equal(experience.active, false);
	assert.equal(root.getAttribute("data-ui-x"), null);
});

// ------------------------------------------------------------ session

function makeSession() {
	const engines = makeEngines();
	const calls = [];
	const preferences = {
		save: async (payload) => {
			calls.push({ type: "save", ...payload });
			const key = payload.experience || engines.experience.config.key;
			engines.experience.update(experiencePayload({ key }));
			const pack = experiencePayload().available.find((p) => p.key === key);
			engines.layout.update(layoutPayload(pack.layout));
			engines.theme.update(makeConfig({ light_theme: pack.selection.light_theme, density: pack.selection.density }));
		},
		restoreExperience: async (key) => calls.push({ type: "restore", key }),
	};
	const session = new CustomizationSession({
		themeEngine: engines.theme,
		layoutEngine: engines.layout,
		experienceEngine: engines.experience,
		preferences,
		doc: engines.doc,
		CustomEvent: FakeCustomEvent,
	});
	return { ...engines, session, calls };
}

test("session: picking an experience previews theme, layout and shell together; cancel restores all", () => {
	const { root, session, boot } = makeSession();
	session.begin();
	session.set("experience", "application-hub");
	assert.equal(root.getAttribute("data-ui-theme"), "professional-blue");
	assert.equal(root.getAttribute("data-ui-nav"), "compact");
	assert.equal(root.getAttribute("data-ui-cards"), "minimal");
	assert.equal(root.getAttribute(SHELL_ATTRIBUTES.nav), "app-rail");
	assert.equal(boot.home_page, HOME_PAGE);
	assert.ok(session.isDirty());
	session.cancel();
	assert.equal(root.getAttribute("data-ui-theme"), "classic-light");
	assert.equal(root.getAttribute("data-ui-nav"), "standard");
	assert.equal(root.getAttribute(SHELL_ATTRIBUTES.nav), "structured");
	assert.equal(boot.home_page, "workspace");
	assert.equal(session.isDirty(), false);
});

test("session: an adjustment previews without changing the experience", () => {
	const { root, session } = makeSession();
	session.begin();
	session.set("form_format", "Compact");
	assert.equal(root.getAttribute("data-ui-form"), "compact");
	assert.equal(root.getAttribute("data-ui-x-preview"), null);
	assert.deepEqual(session.changedKeys(), ["form_format"]);
});

test("session: save sends the experience and what changed; the preview ends", async () => {
	const { session, calls, root } = makeSession();
	session.begin();
	session.set("experience", "application-hub");
	session.set("form_format", "Compact");
	await session.save();
	assert.equal(calls.length, 1);
	assert.equal(calls[0].experience, "application-hub");
	assert.equal(calls[0].form_format, "Compact");
	assert.ok(!("appearance" in calls[0]), "unchanged appearance not sent");
	assert.equal(root.getAttribute("data-ui-x"), "application-hub");
	assert.equal(root.getAttribute("data-ui-x-preview"), null);
	assert.equal(session.isDirty(), false);
});

test("session: with theme adjustments closed, switching packs does not send theme keys", async () => {
	const { session, calls, theme } = makeSession();
	theme.config.allow_user_selection = 0;
	session.begin();
	session.set("experience", "application-hub");
	await session.save();
	assert.ok(!("light_theme" in calls[0]));
	assert.ok(!("density" in calls[0]));
	assert.equal(calls[0].experience, "application-hub");
});

test("session: begin() keeps a running preview (navigating back to the page)", () => {
	const { session } = makeSession();
	session.begin();
	session.set("experience", "application-hub");
	session.begin();
	assert.equal(session.draft.experience, "application-hub");
});

test("session: restore asks the server for that pack and starts over", async () => {
	const { session, calls } = makeSession();
	session.begin();
	session.set("density", "Spacious");
	await session.restore("classic-business");
	assert.deepEqual(calls, [{ type: "restore", key: "classic-business" }]);
	assert.equal(session.isDirty(), false);
});

test("the preview bar names the previewed experience and hides after cancel", async () => {
	const { session, doc } = makeSession();
	const parts = {};
	const el = {
		hidden: false,
		set innerHTML(v) {},
		setAttribute() {},
		addEventListener() {},
		querySelector: (sel) => (parts[sel] = parts[sel] || { textContent: "", hidden: false }),
	};
	const body = { appendChild(child) { this.child = child; }, getAttribute: () => "List/Sales Invoice" };
	doc.body = body;
	doc.createElement = () => el;
	const bar = new PreviewBar({ doc, session, translate: (s, args) => (args ? s.replace("{0}", args[0]) : s) });
	bar.install();
	session.begin();
	session.set("experience", "application-hub");
	assert.equal(el.hidden, false);
	assert.match(parts[".eui-preview-bar-text"].textContent, /application-hub/);
	await bar.act("cancel");
	assert.equal(el.hidden, true);
	assert.ok(doc.events.filter((e) => e.type === SESSION_EVENT).length >= 3);
});

// ------------------------------------------------------------ sketches

test("sketches follow the component variants and only use safe token values", () => {
	const theme = { tokens: { primary: "#123456", background: "red;}</style><script>", surface: "#fff" } };
	const classic = sketchHtml(packEntry("classic-business"), "home", theme);
	const hub = sketchHtml(HUB, "home", theme);
	assert.match(classic, /data-home="workspace"/);
	assert.match(classic, /sk-top-classic/);
	assert.match(hub, /data-nav="app-rail"/);
	assert.match(hub, /sk-hero/);
	assert.doesNotMatch(hub, /sk-rail/, "the launcher home has no rail");
	assert.match(sketchHtml(HUB, "list", theme), /sk-rail/, "other pages keep the app rail");
	assert.match(classic, /--sk-primary:#123456/);
	assert.doesNotMatch(classic, /<script>/);
	for (const view of ["home", "form", "list", "report", "unknown"])
		assert.match(sketchHtml(HUB, view, theme), /class="eui-sk/);
	assert.notEqual(sketchHtml(packEntry("a"), "form", theme), sketchHtml(HUB, "form", theme));
});
