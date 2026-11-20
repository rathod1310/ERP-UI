// End-to-end check of the theme engine in a real browser against a running site.
//
// Usage (see docs/phase-1-report.md for the full procedure):
//   node e2e.mjs --base http://127.0.0.1:8011 --chrome /path/to/headless_shell \
//                --password <pw> --out <screenshot dir>
//
// Needs the users from support.py. The browser plumbing is in harness.mjs.

import { createHarness, USERS } from "./harness.mjs";

const h = createHarness(process.argv.slice(2), { out: "erpnext-ui-e2e" });
const { DESK_READY, sleep, pageErrors, evaluate, waitFor, goto, login } = h;
const { screenshot, state, check, expect, xcall } = h;

const ON_TODO_LIST =
	"window.cur_list && cur_list.doctype === 'ToDo' && frappe.get_route()[0] === 'List'";

// ---------------------------------------------------------------- the run
async function run() {
	const browser = await h.start();
	const cdp = h.cdp;

	try {
		// Start from a known state.
		await login(USERS.admin);
		await xcall("erpnext_ui.api.settings.reset_settings");
		await xcall("erpnext_ui.api.preferences.reset_preferences");

		await login(USERS.a);
		await xcall("erpnext_ui.api.preferences.reset_preferences");
		await goto("/app/home");

		await check("theme initialises with site default (Corporate Blue)", async () => {
			const s = await state();
			expect(
				[s.adapter, s.theme, s.mode, s.dataTheme, s.styles],
				["v16", "corporate-blue", "light", "light", 1],
				"attributes"
			);
			// Phase 2: the page shows the theme background, cards the surface.
			expect([s.htmlBg, s.cardBg], ["rgb(242, 245, 249)", "#ffffff"], "page and card from tokens");
			expect(s.primary, "#1d4f91", "--primary mapped to --ui-primary");
			await screenshot("01-corporate-blue-home");
			return s;
		});

		await check("design tokens reach native components (primary button colours)", async () => {
			await goto("/app/todo/new");
			const btn =
				await evaluate(`(() => { const b = document.querySelector('.page-actions .btn-primary:not(.hide)');
				if (!b) return null; const cs = getComputedStyle(b); return [cs.backgroundColor, cs.color]; })()`);
			expect(btn, ["rgb(29, 79, 145)", "rgb(255, 255, 255)"], "primary button bg/text (Corporate Blue)");
			await screenshot("02-corporate-blue-form");
			return btn;
		});

		await check("theme switching applies without a page reload", async () => {
			await evaluate("window.__euiNoReload = 1");
			await evaluate(
				`erpnext_ui.preferences.save({light_theme: 'Slate Professional'}).then(() => 1)`
			);
			const s = await state();
			expect(await evaluate("window.__euiNoReload"), 1, "same page instance");
			expect(
				[s.theme, s.uiPrimary, s.styles],
				["slate-professional", "#334155", 1],
				"switched"
			);
			expect(s.primary, "#334155", "native --primary follows the theme");
		});

		await check("selection persists across a browser refresh", async () => {
			await goto("/app/home");
			const s = await state();
			expect(s.theme, "slate-professional", "after reload");
			await screenshot("03-slate-professional-home");
		});

		await check("route navigation keeps the theme", async () => {
			// Start from a different page: for a user with only ToDo access the v16
			// home already shows the ToDo list, so set_route would not navigate.
			await goto(
				"/app/ui-preferences",
				DESK_READY + " && document.querySelector('.eui-theme-card')"
			);
			await evaluate(`frappe.set_route('List', 'ToDo')`);
			await waitFor(ON_TODO_LIST);
			await sleep(600);
			const s = await state();
			expect(
				[s.theme, s.adapter, s.styles],
				["slate-professional", "v16", 1],
				"after route change"
			);
			await screenshot("04-slate-professional-list");
		});

		await check("dark mode", async () => {
			await evaluate(
				`erpnext_ui.preferences.save({appearance: 'Dark', dark_theme: 'Corporate Blue Dark'}).then(() => 1)`
			);
			let s = await state();
			expect(
				[s.theme, s.mode, s.dataTheme, s.themeMode],
				["corporate-blue-dark", "dark", "dark", "dark"],
				"dark attrs"
			);
			expect([s.htmlBg, s.cardBg], ["rgb(15, 22, 34)", "#162030"], "dark page and card");
			await goto("/app/todo/new");
			s = await state();
			expect(
				s.theme,
				"corporate-blue-dark",
				"dark persists after reload (server-rendered data-theme)"
			);
			await screenshot("05-corporate-blue-dark-form");
			await goto("/app/todo");
			await screenshot("06-corporate-blue-dark-list");
		});

		await check("Graphite Dark", async () => {
			await evaluate(
				`erpnext_ui.preferences.save({dark_theme: 'Graphite Dark'}).then(() => 1)`
			);
			const s = await state();
			expect([s.theme, s.htmlBg, s.cardBg], ["graphite-dark", "rgb(14, 16, 19)", "#171a1f"], "graphite dark");
			await screenshot("07-graphite-dark-list");
		});

		await check("automatic mode follows the operating system", async () => {
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: "light" }],
			});
			await evaluate(`erpnext_ui.preferences.save({appearance: 'Automatic'}).then(() => 1)`);
			let s = await state();
			expect(
				[s.theme, s.themeMode, s.dataTheme],
				["slate-professional", "automatic", "light"],
				"OS light"
			);
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: "dark" }],
			});
			await sleep(300);
			s = await state();
			expect([s.theme, s.dataTheme], ["graphite-dark", "dark"], "OS switched to dark");
			await goto("/app/home");
			s = await state();
			expect(s.theme, "graphite-dark", "auto + OS dark after reload");
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: "light" }],
			});
			await sleep(300);
			s = await state();
			expect(s.theme, "slate-professional", "OS back to light");
		});

		await check("Frappe's native Toggle Theme stays in sync", async () => {
			try {
				await evaluate(
					`(() => { const t = new frappe.ui.ThemeSwitcher(); t.toggle_theme('dark'); t.hide(); return 1; })()`
				);
				await sleep(800);
				const s = await state();
				expect([s.theme, s.dataTheme], ["graphite-dark", "dark"], "after native toggle");
				const cfg = await xcall("erpnext_ui.api.preferences.get_preferences");
				expect(
					[cfg.appearance, cfg.appearance_source],
					["Dark", "user"],
					"choice recorded on the server"
				);
				await goto("/app/home");
				expect((await state()).theme, "graphite-dark", "native choice survives reload");
			} finally {
				await evaluate(`erpnext_ui.preferences.save({appearance: 'Light'}).then(() => 1)`);
			}
			expect((await state()).theme, "slate-professional", "back to light");
		});

		await check("density and font preferences", async () => {
			await evaluate(
				`erpnext_ui.preferences.save({density: 'Spacious', font: 'System UI'}).then(() => 1)`
			);
			await goto("/app/todo/new");
			const s = await state();
			expect(
				[s.density, s.font, s.inputHeight],
				["spacious", "system", "32px"],
				"density/font"
			);
			const h = await evaluate(
				`Math.round(document.querySelector('.frappe-control input.form-control, .frappe-control textarea, .frappe-control select')?.getBoundingClientRect().height || 0)`
			);
			await screenshot("08-spacious-system-font");
			await evaluate(
				`erpnext_ui.preferences.save({density: 'Comfortable', font: 'Inter'}).then(() => 1)`
			);
			return { inputHeight: h };
		});

		await check(
			// Since Phase 3 a preview stays on every route (with the preview bar)
			// until it is saved or cancelled.
			"preferences page: preview does not save, persists across routes, Cancel restores",
			async () => {
				await goto(
					"/app/ui-preferences",
					DESK_READY + " && document.querySelector('.eui-theme-card')"
				);
				const cards = await evaluate(
					`document.querySelectorAll('.eui-theme-card[data-theme-name]').length`
				);
				expect(cards, 10, "ten theme cards (Phase 3 collection)");
				await screenshot("09-preferences-page");
				await evaluate(
					`document.querySelector('[data-gallery="Light"] [data-theme-name="Executive Green"]').click()`
				);
				await sleep(300);
				let s = await state();
				expect([s.theme, s.preview], ["executive-green", "1"], "previewing");
				const bar = await evaluate(`!document.querySelector('.eui-preview-bar').hidden`);
				expect(bar, true, "preview bar visible");
				await screenshot("10-preferences-preview-executive-green");
				const saved = await xcall("erpnext_ui.api.preferences.get_preferences");
				expect(saved.light_theme, "Slate Professional", "server unchanged during preview");
				await evaluate(`frappe.set_route('List', 'ToDo')`);
				await waitFor(ON_TODO_LIST);
				await sleep(500);
				s = await state();
				expect([s.theme, s.preview], ["executive-green", "1"], "preview kept on another route");
				await evaluate(`document.querySelector('.eui-preview-bar [data-action="cancel"]').click()`);
				await sleep(300);
				s = await state();
				expect(
					[s.theme, s.preview, await evaluate(`document.querySelector('.eui-preview-bar').hidden`)],
					["slate-professional", null, true],
					"Cancel Preview restored the saved theme"
				);
			}
		);

		await check(
			"preferences page: dark theme preview while in light mode, then save",
			async () => {
				await goto(
					"/app/ui-preferences",
					DESK_READY + " && document.querySelector('.eui-theme-card')"
				);
				await evaluate(
					`document.querySelector('[data-gallery="Dark"] [data-theme-name="Corporate Blue Dark"]').click()`
				);
				await sleep(300);
				let s = await state();
				expect(
					[s.theme, s.dataTheme, s.themeMode],
					["corporate-blue-dark", "dark", "light"],
					"forced dark preview"
				);
				await screenshot("11-preferences-preview-dark");
				await evaluate(`document.querySelector('.eui-preview-bar [data-action="save"]').click()`);
				await waitFor(`document.querySelector('.eui-preview-bar').hidden`);
				await sleep(500);
				s = await state();
				expect(
					[s.theme, s.preview],
					["slate-professional", null],
					"light shown again after save"
				);
				const saved = await xcall("erpnext_ui.api.preferences.get_preferences");
				expect(saved.dark_theme, "Corporate Blue Dark", "dark theme saved");
			}
		);

		await check("invalid stored theme falls back safely", async () => {
			await evaluate(`frappe.call({method: 'frappe.model.utils.user_settings.save', args: {doctype: 'UI Experience Settings',
				user_settings: JSON.stringify({light_theme: 'Ghost Theme', density: 'Enormous'})}}).then(() => 1)`);
			await goto("/app/home");
			const s = await state();
			expect([s.theme, s.density], ["corporate-blue", "comfortable"], "fallback");
		});

		await check("duplicate bundle load does not re-initialise", async () => {
			const before = await evaluate(`erpnext_ui.engine.applyCount`);
			await evaluate(`new Promise((resolve) => { const src = [...document.scripts].find(s => /erpnext_ui\\.bundle/.test(s.src)).src;
				const el = document.createElement('script'); el.src = src + '?again=1'; el.onload = () => resolve(1); document.body.appendChild(el); })`);
			await sleep(300);
			const after = await evaluate(
				`[erpnext_ui.engine.applyCount, document.querySelectorAll('#erpnext-ui-theme-tokens').length]`
			);
			expect(after, [before, 1], "applyCount and style count unchanged");
		});

		await check("user isolation across logout/login", async () => {
			await evaluate(
				`erpnext_ui.preferences.save({light_theme: 'Warm Classic'}).then(() => 1)`
			);
			await login(USERS.b);
			let s = await state();
			expect(s.theme, "corporate-blue", "user B sees defaults");
			await login(USERS.a);
			s = await state();
			expect(s.theme, "warm-classic", "user A keeps own theme after re-login");
		});

		await check("user menu has Appearance & Theme", async () => {
			const found = await evaluate(
				`frappe.boot.navbar_settings.settings_dropdown.some(i => i.route === '/app/ui-preferences')`
			);
			expect(found, true, "menu entry");
		});

		await check("native ERPNext pages load without errors in a themed Desk", async () => {
			await login(USERS.admin);
			await evaluate(
				`erpnext_ui.preferences.save({light_theme: 'Slate Professional', appearance: 'Light'}).then(() => 1)`
			);
			const before = pageErrors.length;
			const pages = [
				["/app/customer", "12-customer-list"],
				["/app/sales-invoice/new", "13-sales-invoice-form"],
				["/app/query-report/General Ledger", "14-general-ledger"],
				["/app/accounting", "15-accounting-workspace"],
			];
			for (const [path, shot] of pages) {
				await goto(path);
				await sleep(800);
				await screenshot(shot);
			}
			expect(pageErrors.slice(before), [], "page errors");
		});

		await check("settings form: gallery, preview and permission", async () => {
			await login(USERS.admin);
			await goto(
				"/app/ui-experience-settings",
				DESK_READY + " && window.cur_frm && document.querySelector('.eui-theme-card')"
			);
			const cards = await evaluate(
				`document.querySelectorAll('[data-fieldname="gallery_html"] .eui-theme-card').length`
			);
			expect(cards, 10, "gallery cards (Phase 3 collection)");
			const status = await evaluate(
				`document.querySelector('.eui-status-grid')?.innerText || ''`
			);
			if (!/v16/.test(status)) throw new Error("status does not show adapter: " + status);
			await screenshot("16-settings-form");
			await evaluate(`cur_frm.set_value('default_light_theme', 'Executive Green')`);
			await sleep(300);
			await evaluate(
				`[...document.querySelectorAll('.page-actions button, .form-inner-toolbar button, .custom-actions button')].find(b => b.innerText.trim() === 'Preview').click()`
			);
			await sleep(500);
			let s = await state();
			expect([s.theme, s.preview], ["executive-green", "1"], "settings preview");
			await screenshot("17-settings-preview");
			const stored = await xcall("frappe.client.get_single_value", {
				doctype: "UI Experience Settings",
				field: "default_light_theme",
			});
			expect(stored, "Corporate Blue", "preview did not save");
			await evaluate(`cur_frm.reload_doc()`);
			await evaluate(`frappe.set_route('List', 'ToDo')`);
			await sleep(800);
			s = await state();
			expect(s.preview, null, "preview ended");
		});

		await check("regular user cannot change global settings", async () => {
			await login(USERS.a);
			const res =
				await evaluate(`fetch('/api/method/erpnext_ui.api.settings.publish_defaults', {method: 'POST',
				headers: {'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': frappe.csrf_token},
				body: JSON.stringify({light_theme: 'Executive Green'})}).then(r => r.status)`);
			expect(res, 403, "HTTP status");
		});

		await check("disabling UI Experience restores native Desk", async () => {
			await login(USERS.admin);
			await xcall("frappe.client.set_value", {
				doctype: "UI Experience Settings",
				name: "UI Experience Settings",
				fieldname: "enabled",
				value: 0,
			});
			await goto("/app/home");
			const s = await state();
			expect(
				[s.adapter, s.theme, s.styles, s.reason],
				[null, null, 0, "disabled"],
				"inactive"
			);
			if (s.primary === "#1d4f91") throw new Error("--primary still themed");
			await screenshot("18-disabled-native");
			await xcall("frappe.client.set_value", {
				doctype: "UI Experience Settings",
				name: "UI Experience Settings",
				fieldname: "enabled",
				value: 1,
			});
			await goto("/app/home");
			expect((await state()).adapter, "v16", "re-enabled");
		});

		await check("no JavaScript errors during the run", async () => {
			expect(pageErrors, [], "errors");
		});
	} finally {
		try {
			await login(USERS.admin);
			await xcall("erpnext_ui.api.settings.reset_settings");
		} catch (e) {
			console.log("cleanup failed:", e.message);
		}
		await h.stop(browser);
	}
	h.finish();
}

run().catch((e) => {
	console.error(e);
	process.exit(2);
});
