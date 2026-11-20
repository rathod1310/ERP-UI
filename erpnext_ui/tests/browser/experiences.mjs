// Phase 3 M3 browser suite: Experience Packs on the real Desk.
//
// For every pack: the home page has that pack's structure (DOM markers, not
// only attributes), the shell attributes match, Sales Invoice, Purchase Order,
// Stock Entry, the Customer list and Sales Register open and work, dark mode
// and phone/tablet widths render without overflow, and the screenshots of the
// six homes differ from each other in pixels. Plus the selection flow:
// gallery, preview without saving, apply, persistence after reload and login,
// restore, site default, and a restricted user's home.
//
// Usage (see docs/phase-3-m3-report.md):
//   node experiences.mjs --base http://127.0.0.1:8011 --chrome /path/to/headless_shell \
//                        --password <pw> --out <screenshot dir>

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { createHarness, USERS } from "./harness.mjs";

const h = createHarness(process.argv.slice(2), {
	out: "erpnext-ui-experiences",
	ignoredErrors: [/play\(\) failed because the user didn't interact/],
});
const { DESK_READY, sleep, pageErrors, evaluate, waitFor, goto, login } = h;
const { screenshot, check, expect, xcall } = h;

const PACKS = [
	{ key: "classic-business", home: "workspace", light: "Corporate Blue", dark: "Corporate Blue Dark" },
	{ key: "modern-business", home: "dashboard", light: "Modern Office", dark: "Modern Office Dark" },
	{ key: "application-hub", home: "hub", light: "Slate Professional", dark: "Slate Professional Dark" },
	{ key: "executive-suite", home: "overview", light: "Executive Green", dark: "Graphite Dark" },
	{ key: "department-workspace", home: "department", light: "Operations Teal", dark: "Operations Teal Dark" },
	{ key: "minimal-professional", home: "minimal", light: "Mono Ink", dark: "Mono Ink Dark" },
];
const CUSTOM = new Set(["workspace", "dashboard", "hub", "overview", "department", "minimal"]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const ON_PAGE = (id) => `frappe.container && frappe.container.page && frappe.container.page.id === 'page-${id}'`;
const HOME_READY = `${DESK_READY} && ${ON_PAGE("ui-home")} && document.querySelector('.eui-home[data-design]') && !document.querySelector('.eui-home.is-loading') && !document.querySelector('.eui-kpi.is-loading')`;
const WORKSPACE_READY = `${DESK_READY} && frappe.get_route()[0] === 'Workspaces' && document.querySelector('.codex-editor .widget')`;
// Classic and Minimal keep Frappe's own home (the v16 Desktop on this site).
const NATIVE_HOME_READY = `${DESK_READY} && frappe.container && frappe.container.page && frappe.container.page.id !== 'page-ui-home' && frappe.container.page.id === 'page-' + erpnext_ui.experience.nativeHome`;
const FORM_READY = (dt) =>
	`${DESK_READY} && window.cur_frm && cur_frm.doctype === ${JSON.stringify(dt)} && !!cur_frm.layout && !cur_frm.is_new() && frappe.container.page.querySelector('.form-layout')`;
const LIST_READY = (dt) =>
	`${DESK_READY} && window.cur_list && cur_list.doctype === ${JSON.stringify(dt)} && frappe.get_route()[0] === 'List' && document.querySelector('.frappe-list .result')`;
const REPORT_READY = `${DESK_READY} && window.frappe.query_report && frappe.query_report.datatable && document.querySelector('.dt-row')`;
const PAGE_READY = `${DESK_READY} && document.querySelector('[data-xp-card] .eui-sk')`;

async function setViewport(width, height) {
	await h.cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
	await sleep(500);
}
async function resetViewport() {
	await h.cdp.send("Emulation.clearDeviceMetricsOverride");
	await sleep(300);
}
const noHorizontalOverflow = () => evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`);

/** Frappe's module onboarding panel covers the same corner on every page; it is
 * not part of any experience, so it is put away before home screenshots. */
const HIDE_ONBOARDING = `(() => { try { frappe.app.sidebar.remove_onboarding_wrapper(); } catch (e) {}
	document.querySelectorAll('.user-onboarding').forEach((el) => (el.style.display = 'none')); return true; })()`;

async function capture() {
	const { data } = await h.cdp.send("Page.captureScreenshot", { format: "png" });
	return data;
}

/**
 * How different two PNG screenshots are, decoded and compared in the page:
 * `mean` is the mean absolute pixel difference (0-100), `regions` the share of
 * a 24 x 16 grid of screen regions whose average colour differs by more than
 * 8 levels. Mostly white pages keep the mean low even when their structure
 * differs completely, so the gate is on regions; the mean is reported.
 */
async function pixelDifference(a, b) {
	return evaluate(`(async () => {
		const load = (b64) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b64; });
		const [x, y] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
		const w = 160, hgt = 105, c = document.createElement('canvas'); c.width = w; c.height = hgt;
		const g = c.getContext('2d', { willReadFrequently: true });
		g.drawImage(x, 0, 0, w, hgt); const p = g.getImageData(0, 0, w, hgt).data;
		g.drawImage(y, 0, 0, w, hgt); const q = g.getImageData(0, 0, w, hgt).data;
		let sum = 0; for (let i = 0; i < p.length; i += 4) sum += Math.abs(p[i]-q[i]) + Math.abs(p[i+1]-q[i+1]) + Math.abs(p[i+2]-q[i+2]);
		const GX = 24, GY = 16, bw = w / GX, bh = hgt / GY; let differ = 0;
		for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
			let d = [0, 0, 0], n = 0;
			for (let y = Math.floor(gy * bh); y < Math.floor((gy + 1) * bh); y++) for (let x = Math.floor(gx * bw); x < Math.floor((gx + 1) * bw); x++) {
				const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) d[c] += p[i + c] - q[i + c]; n++;
			}
			if (Math.max(...d.map((v) => Math.abs(v / n))) > 8) differ++;
		}
		return { mean: Math.round(sum / (w * hgt * 3 * 255) * 1000) / 10, regions: Math.round(differ / (GX * GY) * 100) };
	})()`);
}

async function useExperience(key, appearance = "Light") {
	await xcall("erpnext_ui.api.preferences.save_preferences", { experience: key, appearance });
}

/** Structure of the home that is showing (what the user sees, not attributes). */
const HOME_STRUCTURE = `(() => {
	const html = document.documentElement;
	const root = document.querySelector('.eui-home');
	const side = document.querySelector('.body-sidebar-container');
	const sideVisible = !!side && getComputedStyle(side).display !== 'none' && side.getBoundingClientRect().width > 0;
	const shell = Object.fromEntries(['nav','header','launcher','home','form','list','report'].map(c => [c, html.getAttribute('data-ui-shell-' + c)]));
	const band = document.querySelector('[data-page-route="Workspaces"] .links-widget-box .widget-head');
	const link = document.querySelector('[data-page-route="Workspaces"] .links-widget-box');
	return {
		route: frappe.get_route_str(), page: frappe.container.page && frappe.container.page.id, x: html.getAttribute('data-ui-x'), theme: html.getAttribute('data-ui-theme'), shell, sideVisible,
		design: root && root.getAttribute('data-design'),
		kpis: document.querySelectorAll('.eui-home .eui-kpi').length,
		band: root ? false : !!band && getComputedStyle(band).backgroundColor !== getComputedStyle(link).backgroundColor,
		linkBorder: link ? getComputedStyle(link).borderTopWidth : null,
		markers: {
			hello: !!document.querySelector('.eui-home-hello'), tiles: document.querySelectorAll('.eui-tile').length,
			search: !!document.querySelector('.eui-hub-search'), band: !!document.querySelector('.eui-kpis.is-band'),
			deptTabs: document.querySelectorAll('.eui-dept-tabs button').length, chart: !!document.querySelector('.eui-home-chart svg, .eui-home-chart .frappe-chart'),
			cards: document.querySelectorAll('.eui-home-card').length,
			wsShortcuts: document.querySelectorAll('.eui-ws-shortcut').length, wsCards: document.querySelectorAll('.eui-ws-card').length,
			minSearch: !!document.querySelector('.eui-min-search'), minRows: document.querySelectorAll('.eui-min-list li a').length,
			stages: document.querySelectorAll('.eui-pipeline .eui-stage').length, columns: document.querySelectorAll('.eui-board-col').length,
		},
	};
})()`;

async function run() {
	const browser = await h.start();
	const report = { homes: {}, differences: {}, structure: {} };
	const homeShots = {};
	let names;

	try {
		for (const user of [USERS.a, USERS.b]) {
			await login(user);
			await xcall("erpnext_ui.api.preferences.reset_preferences");
		}
		await login(USERS.admin);
		await xcall("erpnext_ui.api.settings.reset_settings");
		await xcall("erpnext_ui.api.preferences.reset_preferences");
		await evaluate(`localStorage.setItem('sidebar-expanded', 'true'); true`);
		names = await evaluate(`Promise.all(['Sales Invoice', 'Purchase Order', 'Stock Entry'].map(dt =>
			frappe.xcall('frappe.client.get_list', {doctype: dt, filters: {docstatus: dt === 'Purchase Order' ? ['<', 2] : 1}, limit_page_length: 1, order_by: 'creation asc'}, 'GET').then(r => r[0] && r[0].name)))`);
		if (names.some((n) => !n)) throw new Error(`test records missing: ${JSON.stringify(names)} (run records.setup)`);

		await check("gallery: six experiences with structural previews; Classic is active and the site default", async () => {
			await goto("/app/ui-preferences", PAGE_READY);
			const g = await evaluate(`({
				cards: [...document.querySelectorAll('[data-xp-card]')].map(c => c.dataset.xpCard),
				homes: [...document.querySelectorAll('[data-xp-card] .eui-sk')].map(s => s.dataset.home),
				active: document.querySelector('[data-xp-card][aria-pressed="true"]').dataset.xpCard,
				badges: document.querySelector('[data-xp-card="classic-business"] .eui-xp-badges').textContent,
				advancedOpen: document.querySelector('[data-advanced]').open,
				scaled: getComputedStyle(document.querySelector('.eui-sk-canvas')).transform !== 'none' })`);
			expect(g.cards, PACKS.map((p) => p.key), "cards");
			expect(g.homes, PACKS.map((p) => p.home), "previews follow each pack's home design");
			expect(g.active, "classic-business", "inspected pack");
			if (!/Active/.test(g.badges) || !/Site Default/.test(g.badges)) throw new Error(`badges: ${g.badges}`);
			expect(g.advancedOpen, false, "Advanced is secondary (closed)");
			if (!g.scaled) throw new Error("sketch not scaled to the card");
			await screenshot("00-experience-gallery");
		});

		await check("detail: home, form, list and report previews of a pack", async () => {
			await evaluate(`document.querySelector('[data-xp-card="executive-suite"]').click(); true`);
			await sleep(300);
			const seen = [];
			for (const view of ["home", "form", "list", "report"]) {
				await evaluate(`document.querySelector('[data-xp-view="${view}"]').click(); true`);
				await sleep(200);
				seen.push(await evaluate(`document.querySelector('[data-detail] .eui-sk').outerHTML.length`));
				await evaluate(`document.querySelector('[data-detail]').scrollIntoView(); true`);
				await screenshot(`01-detail-executive-${view}`);
			}
			if (new Set(seen).size !== 4) throw new Error("the four previews are not different");
		});

		await check("preview: whole Desk changes, nothing is saved, reload restores the saved experience", async () => {
			await evaluate(`document.querySelector('[data-xp-card="application-hub"]').click(); true`);
			await sleep(200);
			await evaluate(`document.querySelector('[data-xp-action="preview"]').click(); true`);
			await sleep(400);
			const during = await evaluate(`({ x: document.documentElement.getAttribute('data-ui-x'), p: document.documentElement.getAttribute('data-ui-x-preview'),
				home: frappe.boot.home_page, bar: !document.querySelector('.eui-preview-bar').hidden, theme: erpnext_ui.engine.current.theme })`);
			expect(during, { x: "application-hub", p: "1", home: "ui-home", bar: true, theme: "Slate Professional" }, "preview state");
			// In-app navigation: a full page load would end the unsaved preview.
			await evaluate(`frappe.set_route(''); true`);
			await waitFor(HOME_READY);
			await sleep(600);
			const s = await evaluate(HOME_STRUCTURE);
			expect([s.design, s.x], ["hub", "application-hub"], "previewed home shown on the Desk");
			await screenshot("02-preview-hub-home");
			const saved = await xcall("erpnext_ui.api.preferences.get_preferences");
			expect(saved.experience.key, "classic-business", "nothing stored");
			await evaluate(`frappe.set_route('List', 'Sales Invoice'); true`);
			await waitFor(LIST_READY("Sales Invoice"));
			expect(await evaluate(`document.documentElement.getAttribute('data-ui-x')`), "application-hub", "preview stays across pages");
			await goto("/app/home", WORKSPACE_READY); // a full load drops the unsaved preview
			expect(
				await evaluate(`[document.documentElement.getAttribute('data-ui-x'), frappe.boot.home_page, erpnext_ui.experience.shown().shell.home]`),
				["classic-business", "ui-home", "workspace"],
				"after reload"
			);
		});

		await check("apply from the page: Apply to Me stores the pack and switches the home without a reload", async () => {
			await goto("/app/ui-preferences", PAGE_READY);
			await evaluate(`document.querySelector('[data-xp-card="modern-business"]').click(); true`);
			await sleep(200);
			await evaluate(`document.querySelector('[data-xp-action="apply"]').click(); true`);
			await waitFor(`erpnext_ui.experience.config.key === 'modern-business'`);
			expect(await evaluate(`[frappe.boot.home_page, document.documentElement.getAttribute('data-ui-x-preview')]`), ["ui-home", null], "applied");
			await evaluate(`frappe.set_route(''); true`);
			await waitFor(HOME_READY);
			expect((await evaluate(HOME_STRUCTURE)).design, "dashboard", "home without reload");
		});

		for (const pack of PACKS) {
			await check(`${pack.key}: home structure, shell, pages work, screenshots`, async () => {
				await useExperience(pack.key);
				const custom = CUSTOM.has(pack.home);
				await goto("/app", custom ? HOME_READY : NATIVE_HOME_READY);
				await sleep(custom ? 1200 : 300); // charts draw after the data arrives
				let s = await evaluate(HOME_STRUCTURE);
				report.structure[pack.key] = s;
				expect(s.x, pack.key, "pack");
				expect(s.shell.home, pack.home, "home attribute");
				expect(s.theme, slug(pack.light), "theme");
				if (custom) {
					expect([s.page, s.design], ["page-ui-home", pack.home], "home page (served on the empty route)");
					const m = s.markers;
					if (pack.home === "dashboard" && !(m.hello && s.kpis >= 1 && m.cards >= 1)) throw new Error(`dashboard markers ${JSON.stringify(m)}`);
					if (pack.home === "hub" && !(m.search && m.tiles >= 4)) throw new Error(`hub markers ${JSON.stringify(m)}`);
					if (pack.home === "hub" && s.sideVisible) throw new Error("the launcher home should replace the sidebar");
					if (pack.home === "overview" && !(m.band && s.kpis >= 3 && m.chart)) throw new Error(`overview markers ${JSON.stringify(m)}`);
					if (pack.home === "department" && !(m.deptTabs >= 3 && m.stages >= 2 && m.columns === 3)) throw new Error(`department markers ${JSON.stringify(m)}`);
					if (pack.home === "workspace" && !(m.wsShortcuts >= 1 && m.wsCards >= 1)) throw new Error(`classic markers ${JSON.stringify(m)}`);
					if (pack.home === "minimal" && !(m.minSearch && m.minRows >= 1 && s.kpis === 0 && m.cards === 0)) throw new Error(`minimal markers ${JSON.stringify(m)}`);
					if (pack.home !== "hub" && !s.sideVisible) throw new Error("sidebar missing");
				} else {
					if (s.page === "page-ui-home") throw new Error("a workspace experience must keep the native home");
				}
				await evaluate(HIDE_ONBOARDING);
				await sleep(200);
				homeShots[pack.key] = await capture();
				await screenshot(`${pack.key}-1-home`);
				if (["workspace", "minimal"].includes(pack.home)) {
					// Their treatment of Frappe's workspace pages, on the Home workspace.
					await goto("/app/home", WORKSPACE_READY);
					s = await evaluate(HOME_STRUCTURE);
					if (pack.home === "workspace" && !s.band) throw new Error("classic workspace cards have no title band");
					if (pack.home === "minimal" && s.linkBorder !== "0px") throw new Error(`minimal cards keep a border (${s.linkBorder})`);
					await screenshot(`${pack.key}-1b-home-workspace`);
				}

				await goto(`/app/sales-invoice/${names[0]}`, FORM_READY("Sales Invoice"));
				const form = await evaluate(`({ fields: cur_frm.fields_dict.customer && cur_frm.fields_dict.customer.$wrapper.is(':visible'),
					items: cur_frm.fields_dict.items.grid.grid_rows.length, x: document.documentElement.getAttribute('data-ui-x'),
					shellForm: document.documentElement.getAttribute('data-ui-shell-form') })`);
				if (!form.fields || form.items < 1) throw new Error(`Sales Invoice form incomplete ${JSON.stringify(form)}`);
				expect(form.x, pack.key, "pack on forms");
				await screenshot(`${pack.key}-2-sales-invoice`);
				await goto(`/app/purchase-order/${names[1]}`, FORM_READY("Purchase Order"));
				await screenshot(`${pack.key}-3-purchase-order`);
				await goto(`/app/stock-entry/${names[2]}`, FORM_READY("Stock Entry"));
				await screenshot(`${pack.key}-4-stock-entry`);
				await goto("/app/customer", LIST_READY("Customer"));
				const rows = await evaluate(`cur_list.data.length`);
				if (rows < 1) throw new Error("Customer list empty");
				await screenshot(`${pack.key}-5-customer-list`);
				await goto("/app/query-report/Sales Register", REPORT_READY);
				await screenshot(`${pack.key}-6-sales-register`);
				return { home: s.design || s.route, kpis: s.kpis, tiles: s.markers.tiles };
			});
		}

		for (const pack of PACKS) {
			await check(`${pack.key}: applied from the page, the real Desk changes and stays changed across navigation and refresh`, async () => {
				// 1. Apply through the real Appearance page.
				await goto("/desk/ui-preferences", PAGE_READY);
				await evaluate(`document.querySelector('[data-xp-card="${pack.key}"]').click(); true`);
				await sleep(250);
				const before = await evaluate(`erpnext_ui.experience.config.key`);
				if (before !== pack.key) {
					await evaluate(`document.querySelector('[data-xp-action="apply"]').click(); true`);
					await waitFor(`erpnext_ui.experience.config.key === ${JSON.stringify(pack.key)}`);
					await sleep(600);
				}
				const notApplied = await evaluate(`!!document.querySelector('.modal.show') && /Not Applied/.test(document.querySelector('.modal.show').innerText)`);
				expect(notApplied, false, "no 'Experience Not Applied' message");
				const preview = await evaluate(`document.querySelector('[data-xp-card="${pack.key}"] .eui-sk').dataset.home`);
				// 2. The real entry page, full load.
				const seen = [];
				const look = async (label) => {
					const r = await evaluate(`({ page: frappe.container.page.id, design: (document.querySelector('.eui-home') || {}).dataset ? document.querySelector('.eui-home') && document.querySelector('.eui-home').dataset.design : null,
						launcher: !!document.querySelector('#page-desktop') && getComputedStyle(document.querySelector('#page-desktop')).display !== 'none',
						x: document.documentElement.getAttribute('data-ui-x'), theme: document.documentElement.getAttribute('data-ui-theme') })`);
					seen.push([label, r.x]);
					return r;
				};
				await goto("/desk", HOME_READY);
				let r = await look("/desk");
				expect([r.page, r.design, r.launcher], ["page-ui-home", pack.home, false], "/desk shows the experience home, not the old launcher");
				expect(preview, r.design, "gallery preview and real home come from the same definition");
				await evaluate(HIDE_ONBOARDING);
				await screenshot(`${pack.key}-0-real-desk`);
				// 3. Frappe's own launcher route leads to the same home.
				await goto("/desk/desktop", HOME_READY);
				r = await look("/desk/desktop");
				expect([r.page, r.design], ["page-ui-home", pack.home], "/desk/desktop");
				// 4. In-app navigation keeps the experience.
				for (const [label, route, ready] of [
					["workspace", ["Workspaces", "Selling"], WORKSPACE_READY],
					["sales invoice", ["Form", "Sales Invoice", names[0]], FORM_READY("Sales Invoice")],
					["item list", ["List", "Item"], LIST_READY("Item")],
					["report", ["query-report", "Sales Register"], REPORT_READY],
				]) {
					await evaluate(`frappe.set_route(${JSON.stringify(route)}); true`);
					await waitFor(ready);
					r = await look(label);
					expect(r.x, pack.key, `experience on ${label}`);
				}
				// 5. Back home the way Frappe's sidebar menu does it ("Desktop" item).
				await evaluate(`frappe.set_route('/desk'); true`);
				await waitFor(HOME_READY);
				r = await look("home again");
				expect([r.page, r.design], ["page-ui-home", pack.home], "home after navigating");
				// 6. Refresh.
				await h.cdp.send("Page.reload");
				await sleep(800);
				await waitFor(HOME_READY);
				r = await look("after refresh");
				expect([r.page, r.design, r.x, r.theme], ["page-ui-home", pack.home, pack.key, slug(pack.light)], "after refresh");
				return seen;
			});
		}

		await check("cancel preview restores the saved experience; reset returns to the site default", async () => {
			await useExperience("executive-suite");
			await goto("/desk/ui-preferences", PAGE_READY);
			await evaluate(`document.querySelector('[data-xp-card="application-hub"]').click(); true`);
			await sleep(200);
			await evaluate(`document.querySelector('[data-xp-action="preview"]').click(); true`);
			await sleep(400);
			expect(await evaluate(`document.documentElement.getAttribute('data-ui-x')`), "application-hub", "previewing");
			await evaluate(`document.querySelector('.eui-preview-bar [data-action="cancel"]').click(); true`);
			await sleep(400);
			expect(await evaluate(`[document.documentElement.getAttribute('data-ui-x'), frappe.boot.home_page, erpnext_ui.experience.config.key]`), ["executive-suite", "ui-home", "executive-suite"], "after cancel");
			await evaluate(`frappe.set_route(''); true`);
			await waitFor(HOME_READY);
			expect(await evaluate(`document.querySelector('.eui-home').dataset.design`), "overview", "saved home shown");
			await goto("/desk/ui-preferences", PAGE_READY);
			await evaluate(`frappe.pages['ui-preferences'].eui_page.reset(); true`);
			await sleep(400);
			await evaluate(`(document.querySelector('.modal.show .btn-primary') || { click() {} }).click(); true`);
			await waitFor(`erpnext_ui.experience.config.source === 'site'`);
			expect(await evaluate(`erpnext_ui.experience.config.key`), "classic-business", "site default after reset");
		});

		await check("the six homes are visibly different (pixel difference between every pair)", async () => {
			const keys = Object.keys(homeShots);
			if (keys.length !== 6) throw new Error(`only ${keys.length} home screenshots`);
			const low = [];
			for (let i = 0; i < keys.length; i++)
				for (let j = i + 1; j < keys.length; j++) {
					const d = await pixelDifference(homeShots[keys[i]], homeShots[keys[j]]);
					report.differences[`${keys[i]} / ${keys[j]}`] = d;
					if (d.regions < 30) low.push(`${keys[i]} / ${keys[j]}: ${d.regions}% of regions (mean ${d.mean}%)`);
				}
			expect(low, [], "pairs that look alike (fewer than 30% of screen regions differ)");
			return report.differences;
		});

		await check("dark variants: each pack uses its dark theme on its home and forms", async () => {
			const seen = {};
			for (const pack of PACKS) {
				await useExperience(pack.key, "Dark");
				await goto("/app", CUSTOM.has(pack.home) ? HOME_READY : NATIVE_HOME_READY);
				await sleep(600);
				seen[pack.key] = await evaluate(`[document.documentElement.getAttribute('data-ui-theme'), document.documentElement.getAttribute('data-ui-mode')]`);
				await screenshot(`${pack.key}-7-home-dark`);
				if (pack.key === "executive-suite" || pack.key === "minimal-professional") {
					await goto(`/app/sales-invoice/${names[0]}`, FORM_READY("Sales Invoice"));
					await screenshot(`${pack.key}-8-sales-invoice-dark`);
				}
			}
			expect(seen, Object.fromEntries(PACKS.map((p) => [p.key, [slug(p.dark), "dark"]])), "dark themes");
		});

		await check("responsive: every home on a phone and a tablet without horizontal scrolling", async () => {
			const overflow = [];
			for (const pack of PACKS) {
				await useExperience(pack.key, "Light");
				for (const [w, hgt, label] of [[390, 844, "phone"], [820, 1180, "tablet"]]) {
					await setViewport(w, hgt);
					await goto("/app", CUSTOM.has(pack.home) ? HOME_READY : NATIVE_HOME_READY);
					await sleep(500);
					if (!(await noHorizontalOverflow())) overflow.push(`${pack.key} ${label}`);
					await screenshot(`${pack.key}-9-home-${label}`);
				}
			}
			await resetViewport();
			expect(overflow, [], "horizontal overflow");
		});

		await check("search and notifications still open on the experience homes", async () => {
			await useExperience("application-hub");
			await goto("/app", HOME_READY);
			await evaluate(`document.querySelector('.eui-hub-search').click(); true`);
			await waitFor(`document.querySelector('.modal.show #navbar-modal-search, .modal.show .search-input, .awesomplete input:focus, .modal.show input')`, 5000);
			await screenshot("10-hub-search-open");
			await evaluate(`$('.modal.show').modal('hide'); true`);
			await useExperience("executive-suite");
			await goto("/app", HOME_READY);
			const bell = await evaluate(`!!(frappe.app.sidebar && frappe.app.sidebar.notifications)`);
			expect(bell, true, "notifications component installed");
		});

		await check("persistence: the experience survives reload and a new login", async () => {
			await useExperience("department-workspace");
			await goto("/app", HOME_READY);
			await login(USERS.admin);
			await goto("/app", HOME_READY);
			expect(await evaluate(`[erpnext_ui.experience.config.key, document.querySelector('.eui-home').dataset.design]`), ["department-workspace", "department"], "after login");
		});

		await check("restore defaults: adjustments to one pack are removed, the choice stays", async () => {
			await xcall("erpnext_ui.api.preferences.save_preferences", { experience: "modern-business", density: "Compact", navigation: "Compact" });
			let c = await xcall("erpnext_ui.api.preferences.get_preferences");
			expect([c.density, c.layout.values.navigation], ["Compact", "Compact"], "adjusted");
			c = await xcall("erpnext_ui.api.preferences.restore_experience", { experience: "modern-business" });
			expect([c.experience.key, c.density, c.layout.values.navigation], ["modern-business", "Comfortable", "Standard"], "restored");
		});

		await check("site default: an administrator's choice reaches users without their own", async () => {
			await xcall("erpnext_ui.api.settings.publish_defaults", { experience: "executive-suite" });
			await login(USERS.b);
			await goto("/app", HOME_READY);
			expect(await evaluate(`[erpnext_ui.experience.config.key, erpnext_ui.experience.config.source]`), ["executive-suite", "site"], "user B");
			let refused = false;
			const errorsBefore = pageErrors.length;
			try {
				await xcall("erpnext_ui.api.settings.publish_defaults", { experience: "minimal-professional" });
			} catch (e) {
				refused = true;
			}
			await sleep(300);
			pageErrors.splice(errorsBefore); // the refusal logged above is the expected PermissionError
			expect(refused, true, "a normal user cannot set the site default");
		});

		await check("restricted user: home shows only what they may read", async () => {
			await login(USERS.a);
			await useExperience("executive-suite");
			await goto("/app", HOME_READY);
			const r = await evaluate(`({ kpis: document.querySelectorAll('.eui-kpi').length, text: document.querySelector('.eui-home').innerText })`);
			expect(r.kpis, 0, "no number cards for a user without Selling/Buying/Stock access");
			if (!/none of this experience's number cards are available/i.test(r.text)) throw new Error("no empty state explaining missing figures");
			await screenshot("11-restricted-executive-home");
			await useExperience("department-workspace");
			await goto("/app", HOME_READY);
			const tabs = await evaluate(`[...document.querySelectorAll('.eui-dept-tabs button')].map(b => b.textContent.trim())`);
			for (const t of ["Sales", "Purchase", "Accounts"]) if (tabs.includes(t)) throw new Error(`restricted user sees ${t}`);
			await screenshot("12-restricted-department-home");
		});

		await check("no JavaScript errors on any page", async () => {
			expect(pageErrors, [], "page errors");
		});
	} finally {
		try {
			await login(USERS.admin);
			await xcall("erpnext_ui.api.settings.reset_settings");
			await xcall("erpnext_ui.api.preferences.reset_preferences");
			for (const user of [USERS.a, USERS.b]) {
				await login(user);
				await xcall("erpnext_ui.api.preferences.reset_preferences");
			}
		} catch (e) {
			console.log("cleanup failed", e.message);
		}
		writeFileSync(join(h.OUT, "report.json"), JSON.stringify(report, null, 2));
		await h.stop(browser);
	}
	h.finish("experience checks");
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
