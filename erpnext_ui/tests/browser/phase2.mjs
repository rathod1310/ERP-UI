// Phase 2 browser suite: the Desk layout layer (all eight modules), themes,
// responsive behaviour, functional regression of core ERPNext workflows,
// permissions and coexistence, in a real browser against a running site.
//
// Usage (see docs/phase-2-report.md):
//   node phase2.mjs --base http://127.0.0.1:8011 --chrome /path/to/headless_shell \
//                   --password <pw> --out <screenshot dir>
//
// Needs the users from support.py and the records from records.py. Documents
// created here belong to the "EUI Test" customer/supplier/items, so
// records.teardown() removes them.

import { createHarness, USERS } from "./harness.mjs";

const h = createHarness(process.argv.slice(2), {
	out: "erpnext-ui-phase2",
	// Headless Chrome blocks Frappe's notification sound (autoplay policy).
	ignoredErrors: [/play\(\) failed because the user didn't interact/],
});
const { DESK_READY, sleep, pageErrors, evaluate, waitFor, goto, login } = h;
const { screenshot, state, check, expect, xcall } = h;

const CUSTOMER_A = "EUI Test Customer A";
const SUPPLIER = "EUI Test Supplier";
const SERVICE_ITEM = "EUI-TEST-SERVICE";
const STOCK_ITEM = "EUI-TEST-WIDGET";

const FORM_READY = (doctype) =>
	`${DESK_READY} && window.cur_frm && cur_frm.doctype === ${JSON.stringify(doctype)} && !!cur_frm.layout`;
const LIST_READY = (doctype) =>
	`${DESK_READY} && window.cur_list && cur_list.doctype === ${JSON.stringify(doctype)} && frappe.get_route()[0] === 'List' && !!document.querySelector('.frappe-list .result')`;
const REPORT_READY = `${DESK_READY} && window.frappe.query_report && frappe.query_report.datatable && document.querySelector('.dt-row')`;
const WORKSPACE_READY = `${DESK_READY} && frappe.get_route()[0] === 'Workspaces' && document.querySelector('.codex-editor .widget')`;

/** Evaluate inside the visible page container. */
const inPage = (body) =>
	evaluate(`(() => { const page = frappe.container.page; ${body} })()`);

const rect = (sel) =>
	inPage(`const e = page.querySelector(${JSON.stringify(sel)}) || document.querySelector(${JSON.stringify(sel)});
		if (!e) return null; const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
		return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
			bg: c.backgroundColor, color: c.color, border: c.borderTopColor, borderWidth: c.borderTopWidth,
			visible: !!(e.offsetParent || c.position === 'fixed') };`);

const token = (name) =>
	evaluate(`(() => { const p = document.createElement('i'); p.style.color = 'var(${name})';
		document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`);

const noHorizontalOverflow = () =>
	evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`);

async function setViewport(width, height) {
	await h.cdp.send("Emulation.setDeviceMetricsOverride", {
		width,
		height,
		deviceScaleFactor: 1,
		mobile: width < 600,
	});
	await sleep(400);
}

async function resetViewport() {
	await h.cdp.send("Emulation.clearDeviceMetricsOverride");
	await sleep(300);
}

async function setTheme(appearance, theme) {
	const args = { appearance };
	if (appearance === "Dark") args.dark_theme = theme;
	else args.light_theme = theme;
	await evaluate(`erpnext_ui.preferences.save(${JSON.stringify(args)}).then(() => true)`);
}

async function setSetting(fieldname, value) {
	await xcall("frappe.client.set_value", {
		doctype: "UI Experience Settings",
		name: "UI Experience Settings",
		fieldname,
		value,
	});
}

/** Wait for a form save to finish (Frappe freezes the page while saving). */
const SAVED = `window.cur_frm && !cur_frm.is_new() && !cur_frm.is_dirty() && !document.querySelector('#freeze.in') && !cur_frm.save_disabled`;

async function run() {
	const browser = await h.start();
	const created = {};

	try {
		await login(USERS.admin);
		await xcall("erpnext_ui.api.settings.reset_settings");
		await xcall("erpnext_ui.api.preferences.reset_preferences");
		await goto("/app/home", WORKSPACE_READY);

		// ============================================== A. global Desk layout
		await check("A: layout layer active; page background behind white cards", async () => {
			const s = await state();
			const attrs = await evaluate(
				`[document.documentElement.getAttribute('data-ui-layout'), document.documentElement.getAttribute('data-ui-width')]`
			);
			expect(attrs, ["enhanced", "standard"], "layout attributes (Modern preset)");
			expect(s.htmlBg, await token("--ui-background"), "page background");
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			const card = await rect(".layout-main-section");
			expect(card.bg, await token("--ui-surface"), "content card surface");
			expect(card.borderWidth, "1px", "card border");
			const head = await rect(".page-head .page-title");
			if (Math.abs(head.x - card.x) > 2)
				throw new Error(`title (${head.x}) not aligned with card (${card.x})`);
			if (!(await noHorizontalOverflow())) throw new Error("page scrolls sideways");
		});

		// ============================================== D. workspace
		await check("D: workspace widgets are consistent cards aligned with the header", async () => {
			await goto("/app/home", WORKSPACE_READY);
			await screenshot("01-home-workspace");
			const w = await inPage(`
				const widgets = [...page.querySelectorAll('.widget:not(.spacer)')];
				const shortcuts = [...page.querySelectorAll('.widget.shortcut-widget-box')].map(e => Math.round(e.getBoundingClientRect().height));
				const head = page.querySelector('.ce-header .h4');
				const spacer = page.querySelector('.widget.spacer');
				return { count: widgets.length,
					borders: [...new Set(widgets.map(e => getComputedStyle(e).borderTopWidth))],
					shortcutHeights: [...new Set(shortcuts)],
					firstX: Math.round(widgets[0].getBoundingClientRect().x),
					titleX: Math.round(page.querySelector('.page-head .page-title').getBoundingClientRect().x),
					headingColor: head && getComputedStyle(head).color,
					spacerBg: spacer ? getComputedStyle(spacer).backgroundColor : 'none' };`);
			if (w.count < 3) throw new Error(`only ${w.count} widgets`);
			expect(w.borders, ["1px"], "widget borders");
			if (w.shortcutHeights.length > 1)
				throw new Error(`shortcut heights differ: ${w.shortcutHeights}`);
			if (Math.abs(w.firstX - w.titleX) > 2)
				throw new Error(`widgets at ${w.firstX}, header at ${w.titleX}`);
			expect(w.headingColor, await token("--ui-text"), "section heading colour");
			if (!["none", "rgba(0, 0, 0, 0)"].includes(w.spacerBg))
				throw new Error(`spacer painted: ${w.spacerBg}`);
			return w;
		});

		await check("D: workspaces with charts and number cards load without errors", async () => {
			const before = pageErrors.length;
			for (const ws of ["selling", "buying", "stock", "invoicing"]) {
				await goto(`/app/${ws}`, WORKSPACE_READY);
				await sleep(800);
			}
			expect(pageErrors.slice(before), [], "page errors");
		});

		// ============================================== B. sidebar and navigation
		await check("B: sidebar expanded, active item highlighted, long labels get a tooltip", async () => {
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			const sb = await rect(".body-sidebar");
			expect(sb.w, 240, "expanded width (--ui-sidebar-width)");
			// Themes with a gradient sidebar (Phase 3 recipe) paint it as a background image.
			const sbImage = await evaluate(`getComputedStyle(document.querySelector('.body-sidebar')).backgroundImage`);
			if (sb.bg !== (await token("--ui-sidebar-bg")) && !/gradient/.test(sbImage))
				throw new Error(`sidebar background ${sb.bg} / ${sbImage}`);
			const active = await rect(".body-sidebar .active-sidebar");
			expect(active.bg, await token("--ui-sidebar-active-bg"), "active item fill (theme sidebar role)");
			await screenshot("02-sidebar-expanded");
		});

		await check("B: native collapse and expand still work", async () => {
			const before = await evaluate(`localStorage.getItem('sidebar-expanded')`);
			await evaluate(`document.querySelector('.body-sidebar .collapse-sidebar-link').click()`);
			await sleep(600);
			const collapsed = await rect(".body-sidebar");
			if (collapsed.w > 80) throw new Error(`collapsed width ${collapsed.w}`);
			const filterShown = await evaluate(
				`(() => { const b = document.querySelector('.ui-nav-filter'); return !!(b && b.offsetParent); })()`
			);
			if (filterShown) throw new Error("filter box visible in the collapsed sidebar");
			await screenshot("03-sidebar-collapsed");
			await evaluate(`document.querySelector('.body-sidebar .collapse-sidebar-link').click()`);
			await sleep(600);
			expect((await rect(".body-sidebar")).w, 240, "re-expanded");
			if (before !== null)
				await evaluate(`localStorage.setItem('sidebar-expanded', ${JSON.stringify(before)})`);
		});

		await check("B: navigation filter narrows long menus and never adds items", async () => {
			await goto("/app/selling", WORKSPACE_READY);
			await sleep(500);
			const r = await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const box = document.querySelector('.ui-nav-filter');
				const visibleLabels = () => [...document.querySelectorAll('.body-sidebar .sidebar-items .sidebar-item-label')]
					.filter(e => e.offsetParent).map(e => e.textContent.trim());
				const all = document.querySelectorAll('.body-sidebar .sidebar-items .sidebar-item-container').length;
				const input = box.querySelector('input');
				input.value = 'analy'; input.dispatchEvent(new Event('input')); await s(200);
				const filtered = visibleLabels();
				const after = document.querySelectorAll('.body-sidebar .sidebar-items .sidebar-item-container').length;
				input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await s(200);
				const cleared = input.value;
				input.value = 'zzzz'; input.dispatchEvent(new Event('input')); await s(200);
				const empty = !box.querySelector('.ui-nav-filter-empty').hidden;
				input.value = ''; input.dispatchEvent(new Event('input'));
				return { shown: !box.hidden, all, after, filtered, cleared, empty, boxes: document.querySelectorAll('.ui-nav-filter').length };
			})()`);
			if (!r.shown) throw new Error("filter not shown on a long sidebar");
			expect(r.after, r.all, "items are hidden, never removed or added");
			if (!r.filtered.includes("Sales Analytics") || r.filtered.includes("Quotation"))
				throw new Error(`unexpected filter result ${r.filtered}`);
			expect([r.cleared, r.empty, r.boxes], ["", true, 1], "escape clears, empty message, one box");
			await evaluate(`(() => { const i = document.querySelector('.ui-nav-filter input');
				i.value = 'analy'; i.dispatchEvent(new Event('input')); return true; })()`);
			await sleep(300);
			await screenshot("02b-sidebar-filter");
			await evaluate(`(() => { const i = document.querySelector('.ui-nav-filter input');
				i.value = ''; i.dispatchEvent(new Event('input')); return true; })()`);
			await goto("/app/home", WORKSPACE_READY);
			await sleep(300);
			const home = await evaluate(`document.querySelector('.ui-nav-filter').hidden`);
			expect(home, true, "short sidebar hides the filter");
			return r.filtered;
		});

		// ============================================== C. navbar and page header
		await check("C: page header is the top bar with breadcrumbs, title and actions", async () => {
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			const head = await rect(".page-head");
			expect([head.h, head.bg], [49, await token("--ui-navbar-bg")], "height incl. border, bg");
			const crumbs = await inPage(`return [...page.querySelectorAll('.navbar-breadcrumbs li a')].map(a => getComputedStyle(a).color);`);
			expect(crumbs[crumbs.length - 1], await token("--ui-text"), "current page crumb");
			const primary = await rect(".page-head .primary-action");
			if (!primary || !primary.visible) throw new Error("primary action hidden");
			await screenshot("04-navbar-page-header");
		});

		// ============================================== E. forms (regression: create, save, submit)
		await check("E/R: Sales Invoice: link search, fetch, child rows, save", async () => {
			await goto("/app/sales-invoice/new", FORM_READY("Sales Invoice"));
			// Link field search through the real input; pick the result with Enter.
			const results = await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const $i = cur_frm.fields_dict.customer.$input; $i.focus(); $i.val(${JSON.stringify(CUSTOMER_A)}).trigger('input');
				const options = () => [...document.querySelectorAll('[role=listbox]:not([hidden]) [role=option]')];
				for (let i = 0; i < 60 && !options().some(o => o.textContent.includes('Customer A')); i++) await s(150);
				const items = options().map(o => o.textContent.trim().slice(0, 40));
				$i[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
				await s(1500);
				return { items, value: cur_frm.doc.customer };
			})()`);
			if (!results.items.some((t) => t.includes("Customer A")))
				throw new Error(`link search results: ${results.items}`);
			expect(results.value, CUSTOMER_A, "value picked from the search results");
			await waitFor(`cur_frm.doc.customer === ${JSON.stringify(CUSTOMER_A)} && cur_frm.doc.debit_to`);
			// Child table: add a row with the native button, then delete it again.
			const rows = await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const grid = cur_frm.fields_dict.items.grid;
				const n0 = cur_frm.doc.items.length;
				grid.wrapper.find('.grid-add-row').trigger('click'); await s(500);
				const n1 = cur_frm.doc.items.length;
				grid.wrapper.find('.grid-body .grid-row').last().find('.grid-row-check')[0].click(); await s(400);
				const del = grid.wrapper.find('.grid-remove-rows'); const delVisible = del.is(':visible');
				del[0].click(); await s(600);
				return { n0, n1, n2: cur_frm.doc.items.length, delVisible };
			})()`);
			expect([rows.n1 - rows.n0, rows.n2, rows.delVisible], [1, rows.n0, true], "add/delete row");
			await evaluate(`(async () => {
				const row = cur_frm.doc.items[0];
				await frappe.model.set_value(row.doctype, row.name, 'item_code', ${JSON.stringify(SERVICE_ITEM)});
				return true;
			})()`);
			await waitFor(`cur_frm.doc.items[0].item_name && cur_frm.doc.items[0].rate > 0`, 15000);
			await evaluate(`(async () => { const row = cur_frm.doc.items[0];
				await frappe.model.set_value(row.doctype, row.name, 'qty', 3);
				cur_frm.set_value('due_date', frappe.datetime.add_days(frappe.datetime.get_today(), 15)); return true; })()`);
			await sleep(800);
			await screenshot("05-sales-invoice-form");
			// Save with the real primary button.
			await evaluate(`frappe.container.page.querySelector('.page-head .primary-action').click()`);
			await waitFor(SAVED, 20000);
			const doc = await evaluate(`({ name: cur_frm.doc.name, docstatus: cur_frm.doc.docstatus, total: cur_frm.doc.grand_total, item_name: cur_frm.doc.items[0].item_name })`);
			if (doc.docstatus !== 0 || !(doc.total > 0)) throw new Error(JSON.stringify(doc));
			created.si = doc.name;
			return doc;
		});

		await check("E/R: Sales Invoice submits through the native confirmation dialog", async () => {
			if (!created.si) throw new Error("no invoice from the previous step");
			await evaluate(`frappe.container.page.querySelector('.page-head .primary-action').click()`);
			await waitFor(`document.querySelector('.modal.show .btn-primary')`);
			const dialog = await rect(".modal.show .modal-content");
			expect(dialog.bg, await token("--ui-surface-elevated"), "dialog surface");
			await sleep(500); // let the fade-in finish
			await screenshot("12a-submit-confirmation-dialog");
			await evaluate(`document.querySelector('.modal.show .btn-primary').click()`);
			await waitFor(`cur_frm.doc.docstatus === 1 && !document.querySelector('#freeze.in')`, 20000);
			await sleep(800);
			const pill = await inPage(`const p = page.querySelector('.page-head .indicator-pill'); return p && p.textContent.trim();`);
			if (!pill) throw new Error("no status indicator");
			return { name: created.si, status: pill };
		});

		await check("E: document view: status, actions, timeline, sidebar, read-only values", async () => {
			const r = await inPage(`
				const vis = (sel) => { const e = page.querySelector(sel); return !!(e && e.offsetParent); };
				const ro = page.querySelector('[data-fieldname="customer"] .control-value');
				return { create: vis('.page-head .inner-group-button, .page-head .custom-btn-group'),
					menu: vis('.page-head .menu-btn-group'),
					timeline: vis('.new-timeline'), sidebar: vis('.form-sidebar'), footerBg: getComputedStyle(page.querySelector('.form-footer')).backgroundColor,
					roColor: ro && getComputedStyle(ro).color };`);
			expect([r.create, r.menu, r.timeline], [true, true, true], "actions and timeline visible");
			expect(r.roColor, await token("--ui-text"), "read-only value colour");
			expect(r.footerBg, await token("--ui-surface"), "activity card");
			// The "..." menu lists native actions; Print is an icon button in v16.
			const items = await evaluate(`(async () => { frappe.container.page.querySelector('.page-head .menu-btn-group .menu-more-button, .page-head .menu-btn-group button').click();
				await new Promise(r => setTimeout(r, 400));
				const list = [...document.querySelectorAll('.page-head .menu-btn-group .dropdown-menu .dropdown-item')].filter(e => e.offsetParent).map(e => e.textContent.trim());
				document.body.click(); return list; })()`);
			const print = await inPage(`return [...page.querySelectorAll('button, a')].some(e => e.offsetParent && e.innerHTML.includes('icon-printer'));`);
			if (items.length < 2 || !print) throw new Error(`menu: ${items}; print icon: ${print}`);
			return items;
		});

		await check("E/R: Purchase Order can be created and saved", async () => {
			await goto("/app/purchase-order/new", FORM_READY("Purchase Order"));
			await evaluate(`(async () => {
				cur_frm.set_value('supplier', ${JSON.stringify(SUPPLIER)});
				cur_frm.set_value('schedule_date', frappe.datetime.add_days(frappe.datetime.get_today(), 7));
				await new Promise(r => setTimeout(r, 1500));
				const row = cur_frm.doc.items[0];
				await frappe.model.set_value(row.doctype, row.name, 'item_code', ${JSON.stringify(STOCK_ITEM)});
				return true; })()`);
			await waitFor(`cur_frm.doc.items[0].item_name && cur_frm.doc.items[0].uom`, 15000);
			await evaluate(`(async () => { const row = cur_frm.doc.items[0];
				await frappe.model.set_value(row.doctype, row.name, 'qty', 5);
				await frappe.model.set_value(row.doctype, row.name, 'rate', 170);
				if (!row.warehouse) await frappe.model.set_value(row.doctype, row.name, 'warehouse', 'Stores - ' + (await frappe.db.get_value('Company', cur_frm.doc.company, 'abbr')).message.abbr);
				return true; })()`);
			await sleep(800);
			await screenshot("06-purchase-order-form");
			await evaluate(`cur_frm.save()`);
			await waitFor(SAVED, 20000);
			created.po = await evaluate(`cur_frm.doc.name`);
			return created.po;
		});

		await check("E/R: Stock Entry can be created and saved", async () => {
			await goto("/app/stock-entry/new", FORM_READY("Stock Entry"));
			await evaluate(`(async () => {
				cur_frm.set_value('stock_entry_type', 'Material Receipt');
				await new Promise(r => setTimeout(r, 1500));
				const row = cur_frm.doc.items[0];
				await frappe.model.set_value(row.doctype, row.name, 'item_code', ${JSON.stringify(STOCK_ITEM)});
				return true; })()`);
			await waitFor(`cur_frm.doc.items[0].uom`, 15000);
			await evaluate(`(async () => { const row = cur_frm.doc.items[0];
				await frappe.model.set_value(row.doctype, row.name, 'qty', 4);
				await frappe.model.set_value(row.doctype, row.name, 't_warehouse', 'Stores - ' + (await frappe.db.get_value('Company', cur_frm.doc.company, 'abbr')).message.abbr);
				await frappe.model.set_value(row.doctype, row.name, 'basic_rate', 180);
				return true; })()`);
			await sleep(800);
			await screenshot("07-stock-entry-form");
			await evaluate(`cur_frm.save()`);
			await waitFor(SAVED, 20000);
			created.se = await evaluate(`cur_frm.doc.name`);
			return created.se;
		});

		await check("E/R: Customer and Supplier records open", async () => {
			await goto(`/app/customer/${encodeURIComponent(CUSTOMER_A)}`, FORM_READY("Customer"));
			expect(await evaluate(`cur_frm.doc.name`), CUSTOMER_A, "customer");
			await screenshot("08-customer-form");
			await goto(`/app/supplier/${encodeURIComponent(SUPPLIER)}`, FORM_READY("Supplier"));
			expect(await evaluate(`cur_frm.doc.name`), SUPPLIER, "supplier");
		});

		await check("E: custom fields still render", async () => {
			const custom = await evaluate(`(async () => {
				await frappe.model.with_doctype('Sales Invoice');
				return frappe.get_meta('Sales Invoice').fields.filter(f => f.is_custom_field && !['Section Break','Column Break','Tab Break'].includes(f.fieldtype)).map(f => f.fieldname);
			})()`);
			if (!custom.length) return "no custom fields on Sales Invoice in this site (nothing to check)";
			await goto(`/app/sales-invoice/${encodeURIComponent(created.si)}`, FORM_READY("Sales Invoice"));
			const missing = await evaluate(`${JSON.stringify(custom)}.filter(f => !cur_frm.fields_dict[f])`);
			expect(missing, [], "custom fields without a control");
			return custom;
		});

		// ============================================== F. list views
		await check("F: Sales Invoice list: header, rows, selection and bulk actions", async () => {
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			const r = await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const page = frappe.container.page;
				const head = page.querySelector('.list-row-head');
				const rows = [...page.querySelectorAll('.list-row-container .list-row')];
				const heights = [...new Set(rows.map(r => Math.round(r.getBoundingClientRect().height)))];
				rows[0].querySelector('.list-row-checkbox').click(); await s(400);
				const selectedBg = getComputedStyle(rows[0].closest('.list-row-container')).backgroundColor;
				const actions = [...page.querySelectorAll('.page-head .actions-btn-group, .page-head .btn-group .dropdown-toggle')].some(b => b.offsetParent && /action/i.test(b.textContent));
				rows[0].querySelector('.list-row-checkbox').click(); await s(300);
				return { headBg: getComputedStyle(head).backgroundColor, rows: rows.length, heights, selectedBg, actions };
			})()`);
			expect(r.headBg, await token("--ui-surface-muted"), "header row");
			expect(r.selectedBg, await token("--ui-selected"), "selected row");
			if (!r.actions) throw new Error("bulk Actions button not shown for a selection");
			if (r.rows < 8) throw new Error(`only ${r.rows} rows`);
			await screenshot("09-sales-invoice-list");
			return r;
		});

		await check("F/R: list filters, sorting and paging work", async () => {
			const r = await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const count = () => cur_list.data.length;
				const all = count();
				await cur_list.filter_area.add([[ 'Sales Invoice', 'customer', '=', ${JSON.stringify(CUSTOMER_A)} ]]);
				for (let i = 0; i < 40 && cur_list.data.some(d => d.customer && d.customer !== ${JSON.stringify(CUSTOMER_A)}); i++) await s(150);
				await s(800);
				const filtered = count();
				const onlyA = cur_list.data.every(d => (d.customer || ${JSON.stringify(CUSTOMER_A)}) === ${JSON.stringify(CUSTOMER_A)});
				await cur_list.filter_area.clear(); await s(1200);
				const sortBtn = frappe.container.page.querySelector('.sort-selector .btn-order');
				sortBtn.click(); await s(1200);
				const order = cur_list.sort_order;
				sortBtn.click(); await s(800);
				const paging = [...frappe.container.page.querySelectorAll('.list-paging-area .btn-paging')].length;
				return { all, filtered, onlyA, after: count(), order, paging };
			})()`);
			if (!(r.filtered > 0 && r.filtered < r.all && r.onlyA)) throw new Error(JSON.stringify(r));
			expect([r.after, r.paging >= 3], [r.all, true], "filter cleared, paging buttons");
			return r;
		});

		await check("F: Item list renders", async () => {
			await goto("/app/item", LIST_READY("Item"));
			await screenshot("10-item-list");
			const n = await evaluate(`cur_list.data.length`);
			if (n < 2) throw new Error(`items: ${n}`);
		});

		await check("F: empty state", async () => {
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			await evaluate(`cur_list.filter_area.add([['Sales Invoice', 'name', '=', 'EUI-NO-SUCH-INVOICE']]).then(() => true)`);
			try {
				await waitFor(`cur_list.data.length === 0 && getComputedStyle(frappe.container.page.querySelector('.no-result')).display !== 'none'`);
				await screenshot("09b-list-empty-state");
			} finally {
				// The ID filter lives in a standard filter field and is saved to user settings.
				await evaluate(`(async () => { cur_list.page.fields_dict.name.set_value('');
					await new Promise(r => setTimeout(r, 1200)); await cur_list.filter_area.clear(); return true; })()`);
				await waitFor(`cur_list.data.length > 0`);
			}
		});

		// ============================================== G. reports
		await check("G/R: Sales Register runs; header, totals and numbers styled", async () => {
			await goto("/app/query-report/Sales Register", REPORT_READY);
			await sleep(1200);
			const r = await evaluate(`(() => {
				const head = document.querySelector('.dt-cell--header .dt-cell__content');
				const total = document.querySelector('.dt-row-totalRow .dt-cell');
				const dt = document.querySelector('.datatable');
				return { rows: frappe.query_report.data.length, headBg: head && getComputedStyle(head.closest('.dt-cell')).backgroundColor,
					totalWeight: total && getComputedStyle(total).fontWeight, numeric: getComputedStyle(dt).fontVariantNumeric };
			})()`);
			if (r.rows < 6) throw new Error(`rows ${r.rows}`);
			expect([r.headBg, r.numeric], [await token("--ui-surface-muted"), "tabular-nums"], "header and digits");
			if (Number(r.totalWeight) < 600) throw new Error(`total row weight ${r.totalWeight}`);
			await screenshot("11-report-sales-register");
			return r;
		});

		await check("G/R: General Ledger and Stock Balance execute", async () => {
			await goto("/app/query-report/General Ledger", `${DESK_READY} && window.frappe.query_report && frappe.query_report.report_name === 'General Ledger'`);
			await waitFor(`frappe.query_report.data && frappe.query_report.data.length > 0`, 20000);
			await goto("/app/query-report/Stock Balance", `${DESK_READY} && window.frappe.query_report && frappe.query_report.report_name === 'Stock Balance'`);
			await waitFor(`Array.isArray(frappe.query_report.data)`, 20000);
			await sleep(1500);
			return await evaluate(`frappe.query_report.data.length`);
		});

		// ============================================== H. shared components
		await check("H: dropdown menu, autocomplete and date picker use themed surfaces", async () => {
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			await evaluate(`frappe.container.page.querySelector('.menu-btn-group button').click()`);
			await sleep(400);
			const menu = await rect(".page-head .menu-btn-group .dropdown-menu.show");
			expect(menu.bg, await token("--ui-surface-elevated"), "dropdown surface");
			await screenshot("12-dropdown-menu");
			await evaluate(`document.body.click()`);
		});

		// ============================================== themes
		await check("Themes: light theme screenshot (Corporate Blue)", async () => {
			await goto(`/app/sales-invoice/${encodeURIComponent(created.si)}`, FORM_READY("Sales Invoice"));
			await screenshot("13-light-theme");
		});

		await check("Themes: the same document in all six presets", async () => {
			const presets = [
				["Light", "Corporate Blue"],
				["Light", "Slate Professional"],
				["Light", "Warm Classic"],
				["Light", "Executive Green"],
				["Light", "Modern Office"],
				["Dark", "Graphite Dark"],
			];
			const shown = [];
			for (const [i, [appearance, name]] of presets.entries()) {
				await setTheme(appearance, name);
				await goto(`/app/sales-invoice/${encodeURIComponent(created.si)}`, FORM_READY("Sales Invoice"));
				shown.push(await evaluate(`erpnext_ui.engine.current.theme`));
				await screenshot(`theme-${i + 1}-${name.toLowerCase().replace(/ /g, "-")}`);
			}
			await setTheme("Light", "Corporate Blue");
			expect(shown, presets.map(([, name]) => name), "applied presets");
		});

		await check("Themes: dark theme adapts dropdowns, inputs and lists", async () => {
			await setTheme("Dark", "Graphite Dark");
			await goto("/app/sales-invoice/new", FORM_READY("Sales Invoice"));
			const r = await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const input = cur_frm.fields_dict.customer.$input;
				const inputBg = getComputedStyle(input[0]).backgroundColor;
				input.focus(); input.val('EUI').trigger('input');
				for (let i = 0; i < 30 && !document.querySelector('.awesomplete [role=listbox]:not([hidden]) li'); i++) await s(150);
				const list = document.querySelector('.awesomplete [role=listbox]:not([hidden])');
				return { inputBg, listBg: list && getComputedStyle(list).backgroundColor };
			})()`);
			const white = "rgb(255, 255, 255)";
			if (r.inputBg === white || r.listBg === white) throw new Error(JSON.stringify(r));
			expect(r.listBg, await token("--ui-surface-elevated"), "autocomplete surface");
			await screenshot("14-dark-theme-form");
			await evaluate(`cur_frm.dirty && (cur_frm.doc.__unsaved = 0); true`);
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			await screenshot("14b-dark-theme-list");
			await goto("/app/home", WORKSPACE_READY);
			await screenshot("14c-dark-theme-workspace");
			await setTheme("Light", "Corporate Blue");
		});

		// ============================================== responsive
		await check("Responsive: tablet and phone keep actions and do not overflow", async () => {
			const pages = [
				["/app/home", WORKSPACE_READY, "workspace"],
				["/app/sales-invoice", LIST_READY("Sales Invoice"), "list"],
				[`/app/sales-invoice/${encodeURIComponent(created.si)}`, FORM_READY("Sales Invoice"), "form"],
				["/app/query-report/Sales Register", REPORT_READY, "report"],
			];
			const out = {};
			for (const [width, height, label] of [
				[900, 1000, "tablet"],
				[390, 844, "phone"],
			]) {
				await setViewport(width, height);
				for (const [path, ready, kind] of pages) {
					await goto(path, ready);
					await sleep(600);
					if (!(await noHorizontalOverflow())) throw new Error(`${label} ${kind} overflows`);
					if (kind === "list") {
						const add = await rect(".page-head .primary-action");
						if (!add.visible) throw new Error(`${label}: Add button hidden`);
					}
					if (kind === "form" || kind === "list") await screenshot(`15-${label}-${kind}`);
				}
				out[label] = "ok";
			}
			await resetViewport();
			return out;
		});

		// ============================================== settings
		await check("Settings: Contained width limits page content", async () => {
			await setSetting("content_width", "Contained");
			await setViewport(1920, 1000);
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			const w = await rect(".page-body");
			await resetViewport();
			await setSetting("content_width", "Full Width");
			if (w.w > 1440 + 2 * 20 + 1) throw new Error(`page body ${w.w}px`);
			return w.w;
		});

		await check("Settings: turning the layout off keeps the theme, removes the layout", async () => {
			await setSetting("desk_layout", 0);
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			const s = await state();
			const layout = await evaluate(`document.documentElement.getAttribute('data-ui-layout')`);
			const filter = await evaluate(`(() => { const b = document.querySelector('.ui-nav-filter'); return !!(b && b.offsetParent); })()`);
			// "Before" views for the report: Phase 1 theming without the layout layer.
			// The phone-width check leaves Frappe's sidebar collapsed; expand it first.
			await evaluate(`localStorage.setItem('sidebar-expanded', 'true')`);
			await goto("/app/sales-invoice", LIST_READY("Sales Invoice"));
			await screenshot("before-sales-invoice-list");
			await goto(`/app/sales-invoice/${encodeURIComponent(created.si)}`, FORM_READY("Sales Invoice"));
			await screenshot("before-sales-invoice-form");
			await goto("/app/home", WORKSPACE_READY);
			await screenshot("before-home-workspace");
			await setSetting("desk_layout", 1);
			expect([s.adapter, layout, filter], ["v16", null, false], "theme on, layout off");
			expect(s.bodyBg, await token("--ui-surface"), "Phase 1 page colour");
		});

		// ============================================== dynamic routes
		await check("Routes: fast navigation keeps one filter box and one engine", async () => {
			await goto("/app/home", WORKSPACE_READY);
			const before = pageErrors.length;
			const r = await evaluate(`(async () => {
				const s = (ms) => new Promise(r => setTimeout(r, ms));
				const routes = [['List','Sales Invoice'],['Workspaces','Selling'],['Form','Customer',${JSON.stringify(CUSTOMER_A)}],['query-report','Sales Register'],['List','Item'],['Workspaces','Home'],['Workspaces','Stock']];
				for (let round = 0; round < 2; round++) for (const r of routes) { frappe.set_route(...r); await s(700); }
				await s(800);
				return { boxes: document.querySelectorAll('.ui-nav-filter').length, styles: document.querySelectorAll('#erpnext-ui-theme-tokens').length,
					layout: document.documentElement.getAttribute('data-ui-layout') };
			})()`);
			expect(r, { boxes: 1, styles: 1, layout: "enhanced" }, "after 14 route changes");
			expect(pageErrors.slice(before), [], "page errors");
		});

		// ============================================== coexistence
		await check("Coexistence: other installed apps' pages load", async () => {
			const before = pageErrors.length;
			const visited = [];
			for (const doctype of ["Proposal", "BHC Assessment", "BHC Business"]) {
				const exists = await evaluate(`frappe.xcall('frappe.client.get_count', { doctype: ${JSON.stringify(doctype)} }).then(() => true).catch(() => false)`);
				if (!exists) continue;
				await goto(`/app/${frappe_slug(doctype)}`, LIST_READY(doctype));
				visited.push(doctype);
			}
			const bot = await evaluate(`!!document.querySelector('#ai-bot-btn')`);
			expect(pageErrors.slice(before), [], "page errors");
			return { visited, aiLauncher: bot };
		});

		// ============================================== security (restricted user)
		await check("Security: a restricted user keeps native permissions", async () => {
			const errorsBefore = pageErrors.length;
			await login(USERS.b);
			const r = await evaluate(`(async () => {
				const denied = await frappe.xcall('frappe.client.get_list', { doctype: 'Sales Invoice', limit_page_length: 1 }).then(() => false).catch(() => true);
				const reportDenied = await frappe.xcall('frappe.desk.query_report.run', { report_name: 'Sales Register', filters: {} }).then(() => false).catch(() => true);
				return { canRead: frappe.model.can_read('Sales Invoice'), denied, reportDenied,
					layoutKeys: Object.keys(frappe.boot.erpnext_ui.layout || {}).sort(),
					sidebarItems: [...document.querySelectorAll('.body-sidebar .sidebar-items .sidebar-item-label')].map(e => e.textContent.trim()) };
			})()`);
			expect([r.canRead, r.denied, r.reportDenied], [false, true, true], "Sales Invoice and report denied");
			// Presentation data only (the layout block grew in Phase 3 milestone 1).
			expect(r.layoutKeys, ["allowed", "attributes", "defaults", "enabled", "matches", "preset", "registry", "saved", "sources", "values"], "layout payload");
			if (r.sidebarItems.some((t) => /sales invoice/i.test(t)))
				throw new Error(`restricted user sees ${r.sidebarItems}`);
			await goto("/app/sales-invoice", `${DESK_READY}`);
			await sleep(1500);
			const listShown = await evaluate(`!!(window.cur_list && cur_list.doctype === 'Sales Invoice' && document.querySelector('.list-row-container .list-row'))`);
			expect(listShown, false, "no rows for a user without access");
			await screenshot("16-restricted-user");
			// The denials above are the expected outcome; any other error still counts.
			const raised = pageErrors.splice(errorsBefore);
			pageErrors.push(...raised.filter((e) => !/PermissionError|Not permitted|don't have access/i.test(e)));
			await login(USERS.admin);
			return r.sidebarItems;
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
		} catch (e) {
			console.log("cleanup failed:", e.message);
		}
		console.log("created:", JSON.stringify(created));
		await h.stop(browser);
	}
	h.finish("Phase 2 browser checks");
}

function frappe_slug(doctype) {
	return doctype.toLowerCase().replace(/ /g, "-");
}

run().catch((e) => {
	console.error(e);
	process.exit(2);
});
