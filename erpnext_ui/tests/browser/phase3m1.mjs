// Phase 3 milestone 1 browser suite: layout presets, per-category formats,
// theme x layout combinations, preview and cancel across routes, persistence,
// administrator defaults and category locks, responsive behaviour and
// workflows under non-default layouts.
//
// Usage (see docs/phase-3-milestone-1-report.md):
//   node phase3m1.mjs --base http://127.0.0.1:8011 --chrome /path/to/headless_shell \
//                     --password <pw> --out <screenshot dir>
//
// Needs the users from support.py and the records from records.py.

import { createHarness, USERS } from "./harness.mjs";

const h = createHarness(process.argv.slice(2), {
	out: "erpnext-ui-phase3m1",
	ignoredErrors: [/play\(\) failed because the user didn't interact/],
});
const { DESK_READY, sleep, pageErrors, evaluate, waitFor, goto, login } = h;
const { screenshot, state, check, expect, xcall } = h;

const PRESETS = ["Classic", "Modern", "Compact", "Wide"];
const THEMES = [
	["Light", "Corporate Blue"],
	["Light", "Slate Professional"],
	["Light", "Warm Classic"],
	["Light", "Executive Green"],
	["Light", "Modern Office"],
	["Dark", "Graphite Dark"],
];
const CUSTOMER_A = "EUI Test Customer A";
const SERVICE_ITEM = "EUI-TEST-SERVICE";

const PAGE_READY = `${DESK_READY} && document.querySelector('.eui-layout-card')`;
const WORKSPACE_READY = `${DESK_READY} && frappe.get_route()[0] === 'Workspaces' && document.querySelector('.codex-editor .widget')`;
const LIST_READY = (dt) =>
	`${DESK_READY} && window.cur_list && cur_list.doctype === ${JSON.stringify(dt)} && frappe.get_route()[0] === 'List' && document.querySelector('.frappe-list .list-row-container .list-row')`;
const FORM_READY = (dt) =>
	`${DESK_READY} && window.cur_frm && cur_frm.doctype === ${JSON.stringify(dt)} && !!cur_frm.layout`;
const REPORT_READY = `${DESK_READY} && window.frappe.query_report && frappe.query_report.datatable && document.querySelector('.dt-row')`;
const SAVED = `window.cur_frm && !cur_frm.is_new() && !cur_frm.is_dirty() && !document.querySelector('#freeze.in')`;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** In-app navigation (keeps any running preview). */
async function route(path, ready) {
	await evaluate(`frappe.set_route(${JSON.stringify(path)}.split('/').map(decodeURIComponent)); true`);
	await waitFor(ready, 25000);
	await sleep(600);
}

const html = (name) => evaluate(`document.documentElement.getAttribute(${JSON.stringify(name)})`);
const layoutNow = () => evaluate(`erpnext_ui.layout.current && erpnext_ui.layout.current.preset`);
const token = (name) =>
	evaluate(`(() => { const p = document.createElement('i'); p.style.color = 'var(${name})';
		document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`);
const sidebarWidth = () =>
	evaluate(`Math.round(document.querySelector('.body-sidebar').getBoundingClientRect().width)`);
const rowHeight = () =>
	evaluate(`(() => { const rows = frappe.container.page.querySelectorAll('.frappe-list .list-row-container .list-row');
		return Math.round(rows[1 % rows.length].getBoundingClientRect().height); })()`);
const formInputHeight = () =>
	evaluate(`getComputedStyle(frappe.container.page.querySelector('.std-form-layout')).getPropertyValue('--input-height').trim()`);
const bodyBg = () => evaluate(`getComputedStyle(document.body).backgroundColor`);
const noOverflow = () => evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
const previewBarShown = () =>
	evaluate(`(() => { const b = document.querySelector('.eui-preview-bar'); return !!(b && !b.hidden); })()`);

/** Each check that needs the administrator starts as one, so a failure cannot cascade. */
async function asAdmin() {
	const user = await evaluate(`window.frappe && frappe.session && frappe.session.user`).catch(() => null);
	if (user !== USERS.admin) await login(USERS.admin);
}

async function savePrefs(args) {
	return xcall("erpnext_ui.api.preferences.save_preferences", args);
}

async function setSetting(fieldname, value) {
	await xcall("frappe.client.set_value", {
		doctype: "UI Experience Settings",
		name: "UI Experience Settings",
		fieldname,
		value,
	});
}

async function viewport(width, height) {
	await h.cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
	await sleep(300);
}

async function resetViewport() {
	await h.cdp.send("Emulation.clearDeviceMetricsOverride");
	await sleep(200);
}

async function run() {
	const browser = await h.start();
	let submitted = null;

	try {
		// Start clean: other suites leave personal choices behind.
		await login(USERS.a);
		await xcall("erpnext_ui.api.preferences.reset_preferences");
		await login(USERS.admin);
		await xcall("erpnext_ui.api.settings.reset_settings");
		await xcall("erpnext_ui.api.preferences.reset_preferences");
		await evaluate(`localStorage.setItem('sidebar-expanded', 'true'); true`);
		submitted = await evaluate(`frappe.xcall('frappe.client.get_list', {doctype: 'Sales Invoice',
			filters: {docstatus: 1, customer: ${JSON.stringify(CUSTOMER_A)}}, limit_page_length: 1, order_by: 'creation asc'}, 'GET').then(r => r[0].name)`);

		// ============================================== customization page
		await check("page: eight sections, four layout presets, explained options", async () => {
			await goto("/app/ui-preferences", PAGE_READY);
			const r = await evaluate(`(() => ({
				sections: [...document.querySelectorAll('.eui-section-nav a')].map(a => a.textContent.trim()),
				presets: [...document.querySelectorAll('.eui-layout-card')].map(c => c.dataset.preset),
				themes: document.querySelectorAll('.eui-theme-card[data-theme-name]').length,
				options: document.querySelectorAll('.eui-option').length,
				described: [...document.querySelectorAll('.eui-option')].every(o => o.querySelector('.eui-option-desc').textContent.trim().length > 10),
				showing: document.querySelector('.eui-layout-card[aria-pressed="true"]').dataset.preset,
			}))()`);
			expect(r.sections, ["Themes", "Layout Presets", "Navigation", "Workspace", "Forms", "Lists and Tables", "Typography and Density", "Content and Cards"], "sections");
			expect([r.presets, r.themes, r.options, r.described, r.showing], [PRESETS, 10, 21, true, "Modern"], "controls");
			await screenshot("01-page-themes");
			await evaluate(`document.getElementById('eui-section-layout').scrollIntoView(); window.scrollBy(0, -60); true`);
			await screenshot("02-page-layout-presets");
			await evaluate(`document.getElementById('eui-section-content').scrollIntoView(); window.scrollBy(0, -60); true`);
			await screenshot("03-page-content-options");
			return r;
		});

		// ============================================== every preset, every page type
		const measured = {};
		for (const preset of PRESETS) {
			await check(`preset ${preset}: preview on workspace, list, form and report`, async () => {
				await route("ui-preferences", PAGE_READY);
				await evaluate(`document.querySelector('.eui-layout-card[data-preset="${preset}"]').click(); true`);
				await sleep(400);
				const m = { preset: await layoutNow() };
				await route("home", WORKSPACE_READY);
				m.sidebar = await sidebarWidth();
				m.workspaceMax = await evaluate(`getComputedStyle(frappe.container.page.querySelector('.layout-main')).maxWidth`);
				m.bg = await bodyBg();
				m.surface = await token("--ui-surface");
				await screenshot(`preset-${slug(preset)}-workspace`);
				await route("sales-invoice", LIST_READY("Sales Invoice"));
				m.row = await rowHeight();
				m.overflow = !(await noOverflow());
				await screenshot(`preset-${slug(preset)}-list`);
				await route(`sales-invoice/${submitted}`, FORM_READY("Sales Invoice"));
				m.input = await formInputHeight();
				m.cardBorder = await evaluate(`getComputedStyle(frappe.container.page.querySelector('.std-form-layout > .form-layout')).borderTopColor`);
				await screenshot(`preset-${slug(preset)}-form`);
				await route("query-report/Sales Register", REPORT_READY);
				await screenshot(`preset-${slug(preset)}-report`);
				m.bar = await previewBarShown();
				m.attrs = await evaluate(`erpnext_ui.layout.current.attributes`);
				measured[preset] = m;
				// Choosing Modern while following the site default (also Modern) is still
				// an unsaved choice: it pins Modern for this user.
				expect([m.preset, m.bar, m.overflow], [preset, true, false], "previewed everywhere");
				await evaluate(`document.querySelector('.eui-preview-bar [data-action="cancel"]').click(); true`);
				await sleep(400);
				expect(await layoutNow(), "Modern", "cancelled back to the saved layout");
				return m;
			});
		}

		await check("presets differ the way they say they do", async () => {
			const c = measured.Classic, m = measured.Modern, k = measured.Compact, w = measured.Wide;
			if (!c || !m || !k || !w) throw new Error("a preset check failed earlier");
			expect([c.sidebar, m.sidebar, k.sidebar], [240, 240, 200], "sidebar widths");
			if (w.sidebar > 64) throw new Error(`Wide sidebar not collapsed: ${w.sidebar}`);
			if (!(k.row < m.row)) throw new Error(`Compact rows ${k.row} not shorter than Modern ${m.row}`);
			expect([c.input, m.input, k.input, w.input], ["34px", "28px", "26px", "28px"], "form field heights");
			expect([c.bg === c.surface, m.bg === m.surface], [true, false], "Classic plain page, Modern tinted");
			expect([m.workspaceMax, w.workspaceMax], ["1440px", "none"], "Wide uses the full width");
			expect(c.cardBorder, "rgba(0, 0, 0, 0)", "Classic minimal cards");
			return { rows: [c.row, m.row, k.row, w.row], sidebars: [c.sidebar, m.sidebar, k.sidebar, w.sidebar] };
		});

		// ============================================== every option on its own
		await check("every option of every category applies on its own", async () => {
			const results = {};
			const previewOne = (key, value) =>
				evaluate(`(() => { erpnext_ui.layout.preview({ ${key}: ${JSON.stringify(value)} }); return erpnext_ui.layout.current.attributes.${key}; })()`);
			const end = () => evaluate(`erpnext_ui.layout.endPreview(); true`);

			await route("sales-invoice", LIST_READY("Sales Invoice"));
			for (const v of ["Standard", "Compact", "Collapsed"]) {
				await previewOne("navigation", v);
				await sleep(500);
				results[`navigation ${v}`] = await sidebarWidth();
			}
			for (const v of ["Compact", "Standard", "Comfortable"]) {
				await previewOne("list_format", v);
				await sleep(200);
				results[`list ${v}`] = await rowHeight();
			}
			for (const v of ["Plain", "Tinted"]) {
				await previewOne("page_background", v);
				results[`background ${v}`] = (await bodyBg()) === (await token("--ui-surface"));
			}
			await previewOne("card_style", "Minimal");
			results["cards Minimal"] = await evaluate(`getComputedStyle(frappe.container.page.querySelector('.layout-main-section')).borderTopColor`);
			await end();
			await sleep(400);

			await route("home", WORKSPACE_READY);
			for (const v of ["Compact", "Standard", "Cards", "Comfortable"]) {
				await previewOne("workspace_format", v);
				await sleep(200);
				results[`workspace ${v}`] = await evaluate(`Math.round(frappe.container.page.querySelector('.widget.shortcut-widget-box').getBoundingClientRect().height)`);
			}
			await end();

			await route("sales-invoice/new", FORM_READY("Sales Invoice"));
			for (const v of ["Compact", "Standard", "Comfortable"]) {
				await previewOne("form_format", v);
				await sleep(200);
				results[`form ${v}`] = await evaluate(`Math.round(cur_frm.fields_dict.customer.$input[0].getBoundingClientRect().height)`);
			}
			await end();

			await viewport(1920, 1000);
			await route("sales-invoice", LIST_READY("Sales Invoice"));
			for (const v of ["Standard", "Full Width", "Contained", "Narrow"]) {
				await previewOne("content_width", v);
				await sleep(200);
				results[`width ${v}`] = await evaluate(`Math.round(frappe.container.page.querySelector('.page-body').getBoundingClientRect().width)`);
			}
			await end();
			await resetViewport();
			await sleep(500);

			const r = results;
			expect([r["navigation Standard"], r["navigation Compact"]], [240, 200], "navigation widths");
			if (r["navigation Collapsed"] > 64) throw new Error(`collapsed ${r["navigation Collapsed"]}`);
			if (!(r["list Compact"] < r["list Standard"] && r["list Standard"] < r["list Comfortable"])) throw new Error("list heights");
			if (!(r["workspace Compact"] < r["workspace Standard"] && r["workspace Standard"] < r["workspace Cards"])) throw new Error("workspace heights");
			if (!(r["form Compact"] < r["form Standard"] && r["form Standard"] < r["form Comfortable"])) throw new Error("form heights");
			if (!(r["width Narrow"] < r["width Contained"] && r["width Contained"] < r["width Standard"])) throw new Error("widths");
			expect([r["background Plain"], r["background Tinted"], r["cards Minimal"]], [true, false, "rgba(0, 0, 0, 0)"], "background and cards");
			expect(await sidebarWidth(), 240, "navigation restored after the preview");
			return results;
		});

		// ============================================== theme x layout combinations
		await check("all six themes combine with all four presets (24 combinations)", async () => {
			const seen = [];
			for (const [appearance, themeName] of THEMES) {
				for (const preset of PRESETS) {
					await savePrefs({
						appearance,
						[appearance === "Dark" ? "dark_theme" : "light_theme"]: themeName,
						layout_preset: preset,
					});
					await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
					const s = await state();
					const got = [s.current && s.current.theme, await layoutNow(), await noOverflow()];
					expect(got, [themeName, preset, true], `${themeName} + ${preset}`);
					await screenshot(`combo-${slug(themeName)}-${slug(preset)}`);
					seen.push(`${themeName} + ${preset}`);
				}
			}
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			await evaluate(`localStorage.setItem('sidebar-expanded', 'true'); true`);
			return `${seen.length} combinations`;
		});

		// ============================================== preview and cancel
		await check("preview: theme and layout together across routes; Cancel restores", async () => {
			await goto("/app/ui-preferences", PAGE_READY);
			await evaluate(`document.querySelector('[data-gallery="Light"] [data-theme-name="Slate Professional"]').click(); true`);
			await evaluate(`document.querySelector('.eui-layout-card[data-preset="Compact"]').click(); true`);
			await sleep(400);
			const seen = [];
			for (const [path, ready] of [
				["home", WORKSPACE_READY],
				["sales-invoice", LIST_READY("Sales Invoice")],
				[`sales-invoice/${submitted}`, FORM_READY("Sales Invoice")],
				["query-report/Sales Register", REPORT_READY],
			]) {
				await route(path, ready);
				const s = await state();
				seen.push([s.theme, await html("data-ui-nav"), await previewBarShown()]);
			}
			expect(seen.every((x) => x[0] === "slate-professional" && x[1] === "compact" && x[2]), true, JSON.stringify(seen));
			await screenshot("04-preview-bar-on-report");
			const server = await xcall("erpnext_ui.api.preferences.get_preferences");
			expect([server.light_theme, server.layout.preset], ["Corporate Blue", "Modern"], "nothing stored");
			const counts = await evaluate(`[document.querySelectorAll('#erpnext-ui-theme-tokens').length, document.querySelectorAll('.eui-preview-bar').length]`);
			expect(counts, [1, 1], "one style element, one bar");
			await evaluate(`document.querySelector('.eui-preview-bar [data-action="cancel"]').click(); true`);
			await sleep(400);
			const s = await state();
			expect([s.theme, s.preview, await html("data-ui-nav"), await html("data-ui-layout-preview"), await previewBarShown()],
				["corporate-blue", null, "standard", null, false], "restored");
		});

		// ============================================== save and persistence
		await check("save: persists after reload and re-login; other users unaffected", async () => {
			await goto("/app/ui-preferences", PAGE_READY);
			await evaluate(`document.querySelector('[data-gallery="Light"] [data-theme-name="Warm Classic"]').click(); true`);
			await evaluate(`document.querySelector('.eui-layout-card[data-preset="Compact"]').click(); true`);
			await evaluate(`document.querySelector('.eui-option[data-value="Comfortable"]') && [...document.querySelectorAll('[data-control="list_format"] .eui-option')].find(o => o.dataset.value === 'Comfortable').click(); true`);
			await sleep(300);
			await evaluate(`frappe.container.page.querySelector('.page-head .primary-action').click(); true`);
			await waitFor(`!erpnext_ui.customize.isDirty() && !erpnext_ui.layout.isPreviewing`);
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			let s = await state();
			const after = [s.theme, await layoutNow(), await html("data-ui-list"), await html("data-ui-nav")];
			expect(after, ["warm-classic", "Compact", "comfortable", "compact"], "after reload");
			await login(USERS.a);
			s = await state();
			expect([s.theme, await layoutNow()], ["corporate-blue", "Modern"], "other user unaffected");
			await login(USERS.admin);
			await goto("/app/home", WORKSPACE_READY);
			s = await state();
			expect([s.theme, await layoutNow()], ["warm-classic", "Compact"], "after re-login");
			await goto("/app/ui-preferences", PAGE_READY);
			const custom = await evaluate(`[!document.querySelector('.eui-custom-note').hidden, document.querySelector('.eui-custom-note').textContent]`);
			expect(custom[0], true, "custom combination explained");
			await screenshot("05-page-custom-combination");
			await xcall("erpnext_ui.api.preferences.reset_preferences");
		});

		// ============================================== administrator defaults
		await check("administrator defaults apply to users without choices; users can override", async () => {
			await asAdmin();
			await xcall("erpnext_ui.api.settings.publish_defaults", { layout_preset: "Classic", list_format: "Compact" });
			await login(USERS.a);
			await goto("/app/sales-invoice", `${DESK_READY} && window.erpnext_ui && erpnext_ui.layout.active`);
			const a = [await layoutNow(), await html("data-ui-list"), await html("data-ui-canvas")];
			expect(a, ["Classic", "compact", "plain"], "site default for user a");
			const own = await savePrefs({ layout_preset: "Wide" });
			expect(own.layout.preset, "Wide", "user override");
			const denied = await evaluate(`frappe.xcall('erpnext_ui.api.settings.publish_defaults', {layout_preset: 'Compact'}).then(() => 'allowed').catch(e => 'denied')`);
			expect(denied, "denied", "regular user cannot publish");
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			await login(USERS.admin);
			await xcall("erpnext_ui.api.settings.reset_settings");
		});

		await check("administrator closes categories: controls locked, API refuses, value ignored", async () => {
			await asAdmin();
			await setSetting("allow_navigation", 0);
			await setSetting("allow_layout_preset", 0);
			await login(USERS.a);
			await goto("/app/ui-preferences", PAGE_READY);
			const r = await evaluate(`(() => ({
				presetsDisabled: [...document.querySelectorAll('.eui-layout-card')].every(c => c.disabled),
				navDisabled: [...document.querySelectorAll('[data-control="navigation"] .eui-option')].every(o => o.disabled),
				navNote: !document.querySelector('[data-locked="navigation"]').hidden,
				formsOpen: [...document.querySelectorAll('[data-control="form_format"] .eui-option')].every(o => !o.disabled),
			}))()`);
			expect(r, { presetsDisabled: true, navDisabled: true, navNote: true, formsOpen: true }, "page");
			await screenshot("06-page-locked-categories");
			const api = await evaluate(`frappe.xcall('erpnext_ui.api.preferences.save_preferences', {navigation: 'Collapsed'}).then(() => 'saved').catch(() => 'refused')`);
			expect(api, "refused", "API");
			pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((e) => !/PermissionError|does not allow/.test(e)));
			const engine = await evaluate(`(() => { erpnext_ui.layout.preview({ navigation: 'Collapsed' }); const a = erpnext_ui.layout.current.attributes.navigation; erpnext_ui.layout.endPreview(); return a; })()`);
			expect(engine, "standard", "engine ignores a closed category");
			await login(USERS.admin);
			await xcall("erpnext_ui.api.settings.reset_settings");
		});

		// ============================================== workflows under other layouts
		await check("workflows under Compact: create and save a Sales Invoice, filter a list, run a report", async () => {
			await asAdmin();
			await savePrefs({ layout_preset: "Compact" });
			await goto("/app/sales-invoice/new", FORM_READY("Sales Invoice"));
			await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const $i = cur_frm.fields_dict.customer.$input; $i.focus(); $i.val(${JSON.stringify(CUSTOMER_A)}).trigger('input');
				for (let i = 0; i < 60 && ![...document.querySelectorAll('[role=listbox]:not([hidden]) [role=option]')].length; i++) await s(150);
				$i[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
				await s(1500);
				const row = cur_frm.doc.items[0];
				await frappe.model.set_value(row.doctype, row.name, 'item_code', ${JSON.stringify(SERVICE_ITEM)});
				return true; })()`);
			await waitFor(`cur_frm.doc.customer && cur_frm.doc.items[0].rate > 0`, 20000);
			await evaluate(`cur_frm.set_value('due_date', frappe.datetime.add_days(frappe.datetime.get_today(), 10)); true`);
			await sleep(600);
			await screenshot("07-compact-new-invoice");
			await evaluate(`frappe.container.page.querySelector('.page-head .primary-action').click(); true`);
			await waitFor(SAVED, 20000);
			const saved = await evaluate(`[cur_frm.doc.name, cur_frm.doc.docstatus, cur_frm.doc.grand_total]`);
			await route("sales-invoice", LIST_READY("Sales Invoice"));
			const filtered = await evaluate(`(async () => { await cur_list.filter_area.add([['Sales Invoice', 'name', '=', ${JSON.stringify(saved[0])}]]);
				await new Promise(r => setTimeout(r, 1500)); const n = cur_list.data.length;
				// The ID filter sits in a standard filter field that Frappe saves to list settings.
				cur_list.page.fields_dict.name.set_value(''); await new Promise(r => setTimeout(r, 1200));
				await cur_list.filter_area.clear(); await new Promise(r => setTimeout(r, 1200)); return n; })()`);
			await route("query-report/General Ledger", `${DESK_READY} && window.frappe.query_report && frappe.query_report.report_name === 'General Ledger'`);
			await waitFor(`frappe.query_report.data && frappe.query_report.data.length > 0`, 20000);
			expect([saved[1], saved[2] > 0, filtered], [0, true, 1], "saved draft, filter, report");
			return saved[0];
		});

		await check("Wide: sidebar starts collapsed; the native toggle still expands it for the session", async () => {
			await asAdmin();
			await savePrefs({ layout_preset: "Wide" });
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			const start = await sidebarWidth();
			await evaluate(`document.querySelector('.body-sidebar .collapse-sidebar-link').click(); true`);
			await sleep(600);
			const expanded = await sidebarWidth();
			await route("home", WORKSPACE_READY);
			const afterRoute = await sidebarWidth();
			await screenshot("08-wide-expanded-by-user");
			if (start > 64) throw new Error(`not collapsed at start: ${start}`);
			expect([expanded, afterRoute], [240, 240], "user expansion respected");
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			await evaluate(`localStorage.setItem('sidebar-expanded', 'true'); true`);
		});

		// ============================================== responsive
		await check("responsive: Compact and Wide on tablet and phone", async () => {
			await asAdmin();
			for (const preset of ["Compact", "Wide"]) {
				await savePrefs({ layout_preset: preset });
				for (const [w, hgt, label] of [[900, 1000, "tablet"], [390, 844, "phone"]]) {
					await viewport(w, hgt);
					for (const [path, ready, kind] of [
						["/app/sales-invoice", LIST_READY("Sales Invoice"), "list"],
						[`/app/sales-invoice/${submitted}`, FORM_READY("Sales Invoice"), "form"],
						["/app/home", WORKSPACE_READY, "workspace"],
					]) {
						await goto(path, ready);
						await sleep(400);
						if (!(await noOverflow())) throw new Error(`${preset} ${label} ${kind} overflows`);
						if (kind === "list") {
							const visible = await evaluate(`!!frappe.container.page.querySelector('.page-head .primary-action').offsetParent`);
							if (!visible) throw new Error(`${preset} ${label}: primary action hidden`);
							await screenshot(`09-${slug(preset)}-${label}-list`);
						}
					}
				}
				await resetViewport();
			}
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			await evaluate(`localStorage.setItem('sidebar-expanded', 'true'); true`);
		});

		// ============================================== layout switched off
		await check("Desk layout off: no layout attributes, theme kept, page explains", async () => {
			await asAdmin();
			await setSetting("desk_layout", 0);
			await goto("/app/ui-preferences", `${DESK_READY} && document.querySelector('.eui-theme-card')`);
			const attrs = await evaluate(`['data-ui-layout','data-ui-nav','data-ui-form','data-ui-list','data-ui-width','data-ui-cards','data-ui-canvas'].map(a => document.documentElement.getAttribute(a))`);
			const s = await state();
			const notice = await evaluate(`document.querySelectorAll('.eui-notice').length`);
			await setSetting("desk_layout", 1);
			expect([attrs.every((a) => a === null), s.adapter, notice >= 1], [true, "v16", true], "layout off");
		});

		await check("no JavaScript errors during the run", async () => {
			expect(pageErrors, [], "errors");
		});
	} finally {
		try {
			await resetViewport();
			await login(USERS.admin);
			await xcall("erpnext_ui.api.settings.reset_settings");
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			for (const user of [USERS.a]) {
				await login(user);
				await xcall("erpnext_ui.api.preferences.reset_preferences");
			}
		} catch (e) {
			console.log("cleanup failed:", e.message);
		}
		await h.stop(browser);
	}
	h.finish("Phase 3 milestone 1 browser checks");
}

run().catch((e) => {
	console.error(e);
	process.exit(2);
});
