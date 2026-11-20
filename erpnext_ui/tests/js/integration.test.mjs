// bootstrap(), adapters and the gallery renderer with a fake window.
import { test } from "node:test";
import assert from "node:assert/strict";

import { bootstrap } from "../../public/js/core/bootstrap.js";
import { selectAdapter } from "../../public/js/adapters/index.js";
import { v16Adapter } from "../../public/js/adapters/v16.js";
import { escapeHtml, themeCardHtml } from "../../public/js/configuration/gallery.js";
import { makeConfig, makeEnv, theme } from "./helpers.mjs";

function fakeFrappe(config) {
	const routeHandlers = [];
	return {
		boot: {
			erpnext_ui: config,
			navbar_settings: {
				settings_dropdown: [{ item_label: "Toggle Theme", item_type: "Action" }],
			},
		},
		ui: { set_theme() {} },
		router: { on: (event, fn) => routeHandlers.push(fn) },
		get_route_str: () => fakeFrappe.route,
		xcall: async () => config,
		routeHandlers,
	};
}

function fakeWindow(config, envOptions) {
	const env = makeEnv(envOptions);
	const frappe = fakeFrappe(config);
	const win = {
		document: env.doc,
		frappe,
		matchMedia: env.deps.matchMedia,
		MutationObserver: env.deps.MutationObserver,
		CustomEvent: env.deps.CustomEvent,
	};
	env.doc.documentElement = env.root;
	return { win, env, frappe };
}

test("bootstrap starts the engine from frappe.boot and installs the v16 adapter", () => {
	v16Adapter._installed = false;
	const { win, env, frappe } = fakeWindow(makeConfig());
	const engine = bootstrap(win);
	assert.equal(engine.active, true);
	assert.equal(env.root.getAttribute("data-ui-adapter"), "v16");
	assert.equal(frappe.routeHandlers.length, 1);
	assert.ok(win.erpnext_ui.preferences);
	const items = frappe.boot.navbar_settings.settings_dropdown;
	assert.equal(items[1].route, "/app/ui-preferences", "menu item added after Toggle Theme");
});

test("bootstrap twice keeps the first engine (duplicate bundle load)", () => {
	v16Adapter._installed = false;
	const { win, frappe } = fakeWindow(makeConfig());
	const first = bootstrap(win);
	const second = bootstrap(win);
	assert.equal(first, second);
	assert.equal(frappe.routeHandlers.length, 1);
	assert.equal(frappe.boot.navbar_settings.settings_dropdown.length, 2);
});

test("route change through the adapter ends a scoped preview", () => {
	v16Adapter._installed = false;
	const { win, frappe } = fakeWindow(makeConfig());
	const engine = bootstrap(win);
	engine.preview({ light_theme: "Professional Blue", route: "ui-preferences" });
	fakeFrappe.route = "List/Customer";
	frappe.routeHandlers[0]();
	assert.equal(engine.isPreviewing, false);
});

test("bootstrap survives a broken boot payload", () => {
	const { win, env } = fakeWindow({ enabled: 1, catalog: "nope" });
	const engine = bootstrap(win);
	assert.equal(engine.active, false);
	assert.equal(env.root.hasAttribute("data-ui-adapter"), false);
});

test("bootstrap survives a missing frappe object", () => {
	const env = makeEnv();
	const win = { document: env.doc, MutationObserver: env.deps.MutationObserver };
	const engine = bootstrap(win);
	assert.equal(engine.active, false);
});

test("bootstrap with a throwing adapter keeps native Desk", () => {
	v16Adapter._installed = false;
	const { win, env, frappe } = fakeWindow(makeConfig());
	frappe.router.on = () => {
		throw new Error("router API changed");
	};
	const engine = bootstrap(win);
	assert.equal(engine.active, false);
	assert.equal(engine.reason, "error");
	assert.equal(env.root.hasAttribute("data-ui-adapter"), false);
});

test("adapter selection needs both the server key and feature detection", () => {
	const frappe = fakeFrappe(makeConfig());
	assert.equal(selectAdapter({ adapter: "v16" }, { frappe }), v16Adapter);
	assert.equal(selectAdapter({ adapter: "v15" }, { frappe }), null);
	assert.equal(selectAdapter({ adapter: null }, { frappe }), null);
	assert.equal(selectAdapter({ adapter: "v16" }, { frappe: { ...frappe, ui: {} } }), null);
	assert.equal(selectAdapter({ adapter: "v16" }, {}), null);
});

test("menu item is added only once", () => {
	const frappe = fakeFrappe(makeConfig());
	assert.equal(v16Adapter.addMenuItem(frappe), true);
	assert.equal(v16Adapter.addMenuItem(frappe), false);
	assert.equal(frappe.boot.navbar_settings.settings_dropdown.length, 2);
});

test("gallery markup escapes names and ignores unsafe colours", () => {
	const evil = theme("Evil", "Light");
	evil.name = '<img src=x onerror="alert(1)">';
	evil.description = "<script>x</script>";
	evil.tokens.primary = "red; background: url(x)";
	const html = themeCardHtml(evil, {
		selected: true,
		badges: [{ label: "<b>", current: true }],
	});
	assert.doesNotMatch(html, /<img|<script|<b>/);
	assert.doesNotMatch(html, /url\(x\)/);
	assert.match(html, /aria-pressed="true"/);
	assert.equal(escapeHtml(`a&<>"'`), "a&amp;&lt;&gt;&quot;&#39;");
});
