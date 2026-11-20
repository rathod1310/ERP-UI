// Phase 3 M2 browser suite: the theme collection (design recipes, dark
// variants, backdrops), the custom colour engine and backdrop settings,
// checked on the real Desk with measured contrast and screenshots.
//
// Usage (see docs/phase-3-m2-report.md):
//   node phase3m2.mjs --base http://127.0.0.1:8011 --chrome /path/to/headless_shell \
//                     --password <pw> --out <screenshot dir>

import { createHarness, USERS } from "./harness.mjs";

const h = createHarness(process.argv.slice(2), {
	out: "erpnext-ui-phase3m2",
	ignoredErrors: [/play\(\) failed because the user didn't interact/],
});
const { DESK_READY, sleep, pageErrors, evaluate, waitFor, goto, login } = h;
const { screenshot, check, expect, xcall } = h;

const THEMES = [
	["Light", "Corporate Blue"],
	["Light", "Slate Professional"],
	["Light", "Warm Classic"],
	["Light", "Executive Green"],
	["Light", "Modern Office"],
	["Dark", "Corporate Blue Dark"],
	["Dark", "Slate Professional Dark"],
	["Dark", "Executive Green Dark"],
	["Dark", "Graphite Dark"],
	["Dark", "Modern Office Dark"],
];
const LEGACY = ["Classic Light", "Professional Blue", "Neutral Grey", "Soft Green", "Professional Dark", "Classic Dark"];

const WORKSPACE_READY = `${DESK_READY} && frappe.get_route()[0] === 'Workspaces' && document.querySelector('.codex-editor .widget')`;
const LIST_READY = `${DESK_READY} && window.cur_list && cur_list.doctype === 'Sales Invoice' && frappe.get_route()[0] === 'List' && document.querySelector('.frappe-list .list-row-container .list-row')`;
const FORM_READY = `${DESK_READY} && window.cur_frm && cur_frm.doctype === 'Sales Invoice' && !!cur_frm.layout && !cur_frm.is_new()`;
const REPORT_READY = `${DESK_READY} && window.frappe.query_report && frappe.query_report.datatable && document.querySelector('.dt-row')`;
const PAGE_READY = `${DESK_READY} && document.querySelector('.eui-theme-card[data-theme-name]')`;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** WCAG contrast of computed colours of two elements/properties, resolved in the page. */
const CONTRAST_JS = `
	(() => {
		const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		const rgb = (css) => { ctx.clearRect(0,0,1,1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0,0,1,1); const d = ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2]]; };
		const lum = ([r,g,b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055) ** 2.4; }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
		const ratio = (a, b) => { const [x,y] = [lum(rgb(a)), lum(rgb(b))].sort((p,q) => q-p); return Math.round(((x+0.05)/(y+0.05))*100)/100; };
		const probe = document.createElement('i'); document.body.appendChild(probe);
		const tok = (n) => { probe.style.color = 'var(' + n + ')'; return getComputedStyle(probe).color; };
		const pairs = {
			'text on surface': ['--ui-text', '--ui-surface', 7],
			'labels on surface': ['--ui-text-secondary', '--ui-surface', 4.5],
			'help text on surface': ['--ui-text-subtle', '--ui-surface', 4.5],
			'subtle on muted fill': ['--ui-text-subtle', '--ui-surface-muted', 4.5],
			'text on page': ['--ui-text', '--ui-background', 7],
			'primary button label': ['--ui-primary-contrast', '--ui-primary', 4.5],
			'sidebar text': ['--ui-sidebar-text', '--ui-sidebar-bg', 4.5],
			'active menu item': ['--ui-sidebar-active-text', '--ui-sidebar-active-bg', 4.5],
			'active tab / links': ['--ui-primary-text', '--ui-surface', 4.5],
			'success pill': ['--ui-on-success', '--ui-success-soft', 4.5],
			'danger pill': ['--ui-on-danger', '--ui-danger-soft', 4.5],
			'warning pill': ['--ui-on-warning', '--ui-warning-soft', 4.5],
			'info pill': ['--ui-on-info', '--ui-info-soft', 4.5],
		};
		const out = {}; const fails = [];
		for (const [k, [fg, bg, min]] of Object.entries(pairs)) { const r = ratio(tok(fg), tok(bg)); out[k] = r; if (r < min) fails.push(k + ' ' + r + ' < ' + min); }
		probe.remove();
		return { out, fails };
	})()`;

async function setTheme(appearance, name) {
	const slot = appearance === "Dark" ? "dark_theme" : "light_theme";
	await xcall("erpnext_ui.api.preferences.save_preferences", { appearance, [slot]: name });
}

async function setSetting(fieldname, value) {
	await xcall("frappe.client.set_value", {
		doctype: "UI Experience Settings",
		name: "UI Experience Settings",
		fieldname,
		value,
	});
}

async function run() {
	const browser = await h.start();
	const report = { contrast: {}, recipes: {} };
	let submitted;

	try {
		await login(USERS.a);
		await xcall("erpnext_ui.api.preferences.reset_preferences");
		await login(USERS.admin);
		await xcall("erpnext_ui.api.settings.reset_settings");
		await xcall("erpnext_ui.api.preferences.reset_preferences");
		await evaluate(`localStorage.setItem('sidebar-expanded', 'true'); true`);
		submitted = await evaluate(`frappe.xcall('frappe.client.get_list', {doctype: 'Sales Invoice',
			filters: {docstatus: 1}, limit_page_length: 1, order_by: 'creation asc'}, 'GET').then(r => r[0].name)`);

		await check("collection: ten themes offered, Phase 1 presets retired", async () => {
			await goto("/app/ui-preferences", PAGE_READY);
			const cards = await evaluate(`({
				light: [...document.querySelectorAll('[data-gallery="Light"] [data-theme-name]')].map(c => c.dataset.themeName),
				dark: [...document.querySelectorAll('[data-gallery="Dark"] [data-theme-name]')].map(c => c.dataset.themeName) })`);
			expect(cards.light, THEMES.filter(([m]) => m === "Light").map(([, n]) => n), "light gallery");
			expect(cards.dark, THEMES.filter(([m]) => m === "Dark").map(([, n]) => n), "dark gallery");
			const catalog = await evaluate(`erpnext_ui.engine.config.catalog.map(t => t.name)`);
			expect(LEGACY.filter((n) => catalog.includes(n)), [], "legacy presets not offered");
			await screenshot("00-theme-gallery");
		});

		for (const [appearance, name] of THEMES) {
			await check(`${name}: recipe applied on every page type, readable, screenshots`, async () => {
				await setTheme(appearance, name);
				await goto("/app/home", WORKSPACE_READY);
				const r = await evaluate(`(() => {
					const html = document.documentElement;
					const entry = erpnext_ui.engine.config.catalog.find(t => t.name === ${JSON.stringify(name)});
					const applied = Object.fromEntries(Object.keys(entry.recipe).map(k => [k, html.getAttribute('data-ui-t-' + k)]));
					const side = document.querySelector('.body-sidebar');
					const sideStyle = getComputedStyle(side);
					const before = getComputedStyle(document.body, '::before');
					return { theme: erpnext_ui.engine.current.theme, mode: html.getAttribute('data-ui-mode'), expected: entry.recipe, applied,
						sidebarRadius: parseFloat(sideStyle.borderTopLeftRadius), sidebarImage: sideStyle.backgroundImage,
						backdrop: before.content !== 'none' && (before.backgroundImage !== 'none'), shadow: getComputedStyle(frappe.container.page.querySelector('.widget:not(.spacer)')).boxShadow };
				})()`);
				expect([r.theme, r.mode], [name, appearance.toLowerCase()], "theme active");
				expect(r.applied, r.expected, "recipe attributes");
				const recipe = r.expected;
				if (recipe.sidebar === "floating" && !(r.sidebarRadius > 6)) throw new Error("floating sidebar has no rounded panel");
				if (recipe.sidebar === "gradient" && !/gradient/.test(r.sidebarImage)) throw new Error("no gradient sidebar");
				if ((recipe.backdrop !== "none") !== r.backdrop) throw new Error(`backdrop layer ${r.backdrop} for ${recipe.backdrop}`);
				if (recipe.surface === "flat" && r.shadow !== "none") throw new Error("flat surface has a shadow");
				report.recipes[name] = recipe;
				await screenshot(`${slug(name)}-1-workspace`);

				await goto("/app/sales-invoice", LIST_READY);
				const list = await evaluate(`(() => {
					const rows = [...frappe.container.page.querySelectorAll('.frappe-list .result .list-row-container')].slice(1, 3);
					const head = frappe.container.page.querySelector('.list-row-head');
					const num = frappe.container.page.querySelector('.list-row:not(.list-row-head) .list-row-col.text-right');
					const input = frappe.container.page.querySelector('.page-form .frappe-control .form-control');
					const btn = frappe.container.page.querySelector('.page-head .primary-action');
					return { bgs: rows.map(r => getComputedStyle(r).backgroundColor), rowBorder: getComputedStyle(rows[0]).borderTopWidth,
						headBorder: getComputedStyle(head).borderBottomWidth, numFont: num ? getComputedStyle(num).fontFamily : '',
						inputBorder: getComputedStyle(input).borderTopWidth, inputBottom: getComputedStyle(input).borderBottomWidth,
						btnRadius: parseFloat(getComputedStyle(btn).borderTopLeftRadius) };
				})()`);
				if (recipe.table === "zebra" && list.bgs[0] === list.bgs[1]) throw new Error("zebra rows not alternating");
				if (recipe.table === "rows" && list.rowBorder !== "1px") throw new Error("rows are not cards");
				if (recipe.table === "ruled" && list.headBorder !== "2px") throw new Error("header not ruled");
				if (recipe.numerals === "mono" && !/Mono|mono/.test(list.numFont)) throw new Error("numbers not monospaced");
				if (recipe.input === "underline" && !(list.inputBorder === "0px" && list.inputBottom === "1px")) throw new Error("fields not underlined");
				if (recipe.button === "pill" && list.btnRadius < 99) throw new Error("buttons not pills");
				await screenshot(`${slug(name)}-2-list`);

				await goto(`/app/sales-invoice/${submitted}`, FORM_READY);
				await screenshot(`${slug(name)}-3-form`);
				if (appearance === "Dark") {
					const white = await evaluate(`(() => {
						const els = ['.std-form-layout > .form-layout', '.form-footer', '.form-sidebar', '.page-head', '.body-sidebar', '.form-grid .grid-static-col'];
						return els.filter(sel => { const e = frappe.container.page.querySelector(sel) || document.querySelector(sel); return e && getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)'; });
					})()`);
					expect(white, [], "white surfaces in a dark theme");
				}
				const contrast = await evaluate(CONTRAST_JS);
				report.contrast[name] = contrast.out;
				expect(contrast.fails, [], "contrast");

				await goto("/app/query-report/Sales Register", REPORT_READY);
				await screenshot(`${slug(name)}-4-report`);
				return contrast.out;
			});
		}

		await check("backdrops: site switch off removes them; through panels makes sidebar translucent", async () => {
			await setTheme("Light", "Corporate Blue");
			await setSetting("backdrop_through_panels", 1);
			await goto("/app/home", WORKSPACE_READY);
			const through = await evaluate(`[document.documentElement.getAttribute('data-ui-backdrop-through'), getComputedStyle(document.querySelector('.body-sidebar')).backdropFilter]`);
			await screenshot("05-backdrop-through-panels");
			await setSetting("enable_backdrops", 0);
			await goto("/app/home", WORKSPACE_READY);
			const off = await evaluate(`[document.documentElement.getAttribute('data-ui-t-backdrop'), document.documentElement.getAttribute('data-ui-backdrop-through'), getComputedStyle(document.body).backgroundColor]`);
			await setSetting("enable_backdrops", 1);
			await setSetting("backdrop_through_panels", 0);
			expect([through[0], /blur/.test(through[1])], ["1", true], "through panels");
			expect([off[0], off[1], off[2] !== "rgba(0, 0, 0, 0)"], ["none", null, true], "backdrops off");
		});

		await check("custom colour engine: preview on the Desk, create, use, then clean up", async () => {
			await goto("/app/ui-experience-settings", `${DESK_READY} && window.cur_frm && cur_frm.doctype === 'UI Experience Settings'`);
			await evaluate(`(() => { [...document.querySelectorAll('.page-head .inner-group-button button, .page-head .custom-actions button, .form-inner-toolbar button, .page-actions button')]
				.find(b => /Create Theme from Colours/.test(b.textContent)).click(); return true; })()`);
			// Frappe sets cur_dialog on shown.bs.modal, after the open transition.
			await waitFor(`window.cur_dialog && cur_dialog.fields_dict && cur_dialog.fields_dict.primary`);
			await evaluate(`(async () => { const d = cur_dialog; d.set_value('theme_name', 'EUI Test Brand'); d.set_value('primary', '#7a1f4b');
				d.set_value('secondary', '#c48a2c'); d.set_value('strength', 'Strong'); return true; })()`);
			await waitFor(`erpnext_ui.engine.isPreviewing && document.documentElement.getAttribute('data-ui-theme') === 'generated-preview'`, 15000);
			await sleep(600);
			const rows = await evaluate(`[...document.querySelectorAll('.modal.show .eui-contrast-report tr')].map(r => r.textContent.includes('✓'))`);
			await screenshot("06-colour-engine-preview");
			if (!rows.length || rows.some((ok) => !ok)) throw new Error(`contrast report ${rows}`);
			await evaluate(`cur_dialog.get_primary_btn().click(); true`);
			await waitFor(`window.cur_frm && cur_frm.doctype === 'UI Theme' && cur_frm.doc.name === 'EUI Test Brand'`, 20000);
			expect(await evaluate(`erpnext_ui.engine.isPreviewing`), false, "preview ended with the dialog");
			await screenshot("07-generated-theme-record");
			await setTheme("Light", "EUI Test Brand");
			await goto("/app/sales-invoice", LIST_READY);
			const applied = await evaluate(`[erpnext_ui.engine.current.theme, document.documentElement.getAttribute('data-ui-t-sidebar')]`);
			await screenshot("08-generated-theme-in-use");
			const contrast = await evaluate(CONTRAST_JS);
			await setTheme("Light", "Corporate Blue");
			await xcall("frappe.client.delete", { doctype: "UI Theme", name: "EUI Test Brand" });
			expect(applied, ["EUI Test Brand", "gradient"], "generated theme in use");
			expect(contrast.fails, [], "generated theme contrast");
		});

		await check("theme and layout combine: Warm Classic + Compact, Graphite Dark + Wide, Modern Office + Classic", async () => {
			for (const [appearance, name, preset] of [["Light", "Warm Classic", "Compact"], ["Dark", "Graphite Dark", "Wide"], ["Light", "Modern Office", "Classic"]]) {
				await xcall("erpnext_ui.api.preferences.save_preferences", {
					appearance, [appearance === "Dark" ? "dark_theme" : "light_theme"]: name, layout_preset: preset,
				});
				await goto("/app/sales-invoice", LIST_READY);
				const got = await evaluate(`[erpnext_ui.engine.current.theme, erpnext_ui.layout.current.preset]`);
				expect(got, [name, preset], "combination");
				await screenshot(`09-combo-${slug(name)}-${slug(preset)}`);
			}
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			await evaluate(`localStorage.setItem('sidebar-expanded', 'true'); true`);
		});

		await check("permissions: a regular user cannot generate or create themes", async () => {
			await login(USERS.a);
			const r = await evaluate(`Promise.all([
				frappe.xcall('erpnext_ui.api.theme.generate_theme', {primary: '#123456', secondary: '#654321'}).then(() => 'allowed').catch(() => 'denied'),
				frappe.xcall('erpnext_ui.api.theme.create_custom_theme', {theme_name: 'X', primary: '#123456', secondary: '#654321'}).then(() => 'allowed').catch(() => 'denied'),
			])`);
			pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((e) => !/PermissionError|Not permitted|No permission/.test(e)));
			expect(r, ["denied", "denied"], "generator endpoints");
			await login(USERS.admin);
		});

		await check("no JavaScript errors during the run", async () => {
			expect(pageErrors, [], "errors");
		});
	} finally {
		try {
			await login(USERS.admin);
			await xcall("erpnext_ui.api.settings.reset_settings");
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			await xcall("frappe.client.delete", { doctype: "UI Theme", name: "EUI Test Brand" }).catch(() => null);
		} catch (e) {
			console.log("cleanup:", e.message);
		}
		console.log("contrast:", JSON.stringify(report.contrast));
		await h.stop(browser);
	}
	h.finish("Phase 3 M2 browser checks");
}

run().catch((e) => {
	console.error(e);
	process.exit(2);
});
