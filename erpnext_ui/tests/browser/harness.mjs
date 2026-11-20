// Shared harness for the browser suites (e2e.mjs: Phase 1 theme engine,
// phase2.mjs: Desk layout and functional regression). Headless Chromium over
// the DevTools protocol, Node built-ins only (fetch, WebSocket).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const USERS = {
	admin: "eui-e2e-admin@example.com",
	a: "eui-e2e-a@example.com",
	b: "eui-e2e-b@example.com",
};

export function parseArgs(argv) {
	return Object.fromEntries(
		argv.reduce(
			(acc, cur, i, arr) =>
				cur.startsWith("--") ? [...acc, [cur.slice(2), arr[i + 1]]] : acc,
			[]
		)
	);
}

export function createHarness(argv, defaults = {}) {
	const args = parseArgs(argv);
	const BASE = args.base || "http://127.0.0.1:8011";
	const CHROME = args.chrome;
	const PASSWORD = args.password;
	const OUT = args.out || join(tmpdir(), defaults.out || "erpnext-ui-e2e");
	const PORT = Number(args.port || 9333);
	const SIZE = defaults.windowSize || "1366,900";

	mkdirSync(OUT, { recursive: true });
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const results = [];
	const pageErrors = [];
	// The temporary test server runs without the socket.io realtime service.
	const IGNORED_ERRORS = [/Error connecting to socket\.io/, ...(defaults.ignoredErrors || [])];
	const recordError = (text) => {
		if (!IGNORED_ERRORS.some((re) => re.test(text))) pageErrors.push(text);
	};

	// ---------------------------------------------------------------- CDP client
	class CDP {
		constructor(ws) {
			this.ws = ws;
			this.id = 0;
			this.pending = new Map();
			this.listeners = [];
			ws.addEventListener("message", (event) => {
				const msg = JSON.parse(event.data);
				if (msg.id && this.pending.has(msg.id)) {
					const { resolve, reject } = this.pending.get(msg.id);
					this.pending.delete(msg.id);
					msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
				} else if (msg.method) {
					for (const fn of this.listeners) fn(msg);
				}
			});
		}
		send(method, params = {}) {
			const id = ++this.id;
			this.ws.send(JSON.stringify({ id, method, params }));
			return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
		}
		on(fn) {
			this.listeners.push(fn);
		}
	}

	async function launch() {
		const profile = mkdtempSync(join(tmpdir(), "eui-chrome-"));
		const proc = spawn(
			CHROME,
			[
				`--remote-debugging-port=${PORT}`,
				`--user-data-dir=${profile}`,
				"--no-first-run",
				"--no-sandbox",
				"--disable-gpu",
				`--window-size=${SIZE}`,
				"about:blank",
			],
			{ stdio: "ignore" }
		);
		for (let i = 0; i < 50; i++) {
			try {
				const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
				const page = list.find((t) => t.type === "page");
				if (page) {
					const ws = new WebSocket(page.webSocketDebuggerUrl);
					await new Promise((r, j) => {
						ws.addEventListener("open", r);
						ws.addEventListener("error", j);
					});
					return { proc, profile, cdp: new CDP(ws) };
				}
			} catch (e) {
				/* not ready yet */
			}
			await sleep(200);
		}
		throw new Error("Chrome did not start");
	}

	// ---------------------------------------------------------------- helpers
	let cdp;

	async function evaluate(expression) {
		const res = await cdp.send("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
		});
		if (res.exceptionDetails)
			throw new Error(
				`evaluate failed: ${res.exceptionDetails.exception?.description || expression}`
			);
		return res.result.value;
	}

	async function waitFor(expression, timeout = 20000) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			try {
				// Coerce to a boolean: returning a DOM node by value can fail to serialise.
				if (await evaluate(`!!(${expression})`)) return true;
			} catch (e) {
				/* page navigating */
			}
			await sleep(150);
		}
		let where = "";
		try {
			where = await evaluate(
				"location.pathname + ' route=' + (window.frappe && frappe.get_route_str && frappe.get_route_str()) + ' cur_list=' + (window.cur_list && cur_list.doctype)"
			);
		} catch (e) {
			/* page unavailable */
		}
		throw new Error(`timed out waiting for: ${expression} (at ${where})`);
	}

	// Desk is ready once Frappe has removed its splash screen (works for the v16
	// desktop, workspaces, lists and forms alike).
	const DESK_READY =
		"window.frappe && frappe.boot && frappe.router && !document.querySelector('.splash') && !document.querySelector('#freeze.in')";

	async function goto(path, ready = DESK_READY) {
		await cdp.send("Page.navigate", { url: BASE + path });
		await sleep(400);
		await waitFor(`document.readyState === 'complete'`);
		if (ready) await waitFor(ready);
		await sleep(500);
	}

	async function login(user) {
		await cdp.send("Network.clearBrowserCookies");
		await goto("/login", null);
		const ok =
			await evaluate(`fetch('/api/method/login', {method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
			body: JSON.stringify({usr: ${JSON.stringify(user)}, pwd: ${JSON.stringify(
				PASSWORD
			)}})}).then(r => r.ok)`);
		if (!ok) throw new Error(`login failed for ${user}`);
		await goto("/app/home");
	}

	async function screenshot(name) {
		const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
		writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
	}

	const state = () =>
		evaluate(`(() => {
			const h = document.documentElement, cs = getComputedStyle(document.body);
			return {
				adapter: h.getAttribute('data-ui-adapter'), theme: h.getAttribute('data-ui-theme'),
				mode: h.getAttribute('data-ui-mode'), dataTheme: h.getAttribute('data-theme'),
				themeMode: h.getAttribute('data-theme-mode'), density: h.getAttribute('data-ui-density'),
				font: h.getAttribute('data-ui-font'), preview: h.getAttribute('data-ui-preview'),
				styles: document.querySelectorAll('#erpnext-ui-theme-tokens').length,
				bodyBg: cs.backgroundColor,
				primary: getComputedStyle(h).getPropertyValue('--primary').trim(),
				cardBg: getComputedStyle(h).getPropertyValue('--card-bg').trim(),
				// With a theme backdrop the body is transparent; the page colour is on <html>.
				htmlBg: getComputedStyle(h).backgroundColor,
				uiPrimary: getComputedStyle(h).getPropertyValue('--ui-primary').trim(),
				fontStack: getComputedStyle(h).getPropertyValue('--font-stack').trim().slice(0, 30),
				inputHeight: getComputedStyle(h).getPropertyValue('--input-height').trim(),
				current: window.erpnext_ui && window.erpnext_ui.engine.current,
				reason: window.erpnext_ui && window.erpnext_ui.engine.reason,
			};
		})()`);

	async function check(name, fn) {
		try {
			const detail = await fn();
			results.push({ name, ok: true, detail });
			console.log(`  PASS  ${name}`);
		} catch (error) {
			results.push({ name, ok: false, detail: error.message });
			console.log(`  FAIL  ${name}: ${error.message}`);
			try {
				await screenshot(`FAIL-${name.replace(/[^a-z0-9]+/gi, "-")}`);
			} catch (e) {
				/* ignore */
			}
		}
	}

	function expect(actual, expected, label) {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			throw new Error(
				`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
			);
		}
	}

	const GET_METHODS = new Set([
		"erpnext_ui.api.preferences.get_preferences",
		"erpnext_ui.api.theme.get_config",
		"frappe.client.get_single_value",
	]);
	const xcall = (method, args = {}) =>
		evaluate(
			`frappe.xcall(${JSON.stringify(method)}, ${JSON.stringify(args)}, ${JSON.stringify(
				GET_METHODS.has(method) ? "GET" : "POST"
			)}).then(r => r)`
		);

	/** Launch Chrome, enable the domains and record page errors. */
	async function start() {
		const browser = await launch();
		cdp = browser.cdp;
		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");
		await cdp.send("Network.enable");
		cdp.on((msg) => {
			if (msg.method === "Runtime.exceptionThrown") {
				recordError(
					msg.params.exceptionDetails.exception?.description ||
						msg.params.exceptionDetails.text
				);
			}
			if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
				recordError(msg.params.args.map((a) => a.value || a.description).join(" "));
			}
		});
		return browser;
	}

	async function stop(browser) {
		browser.proc.kill();
		await sleep(300);
		rmSync(browser.profile, { recursive: true, force: true });
	}

	/** Write results.json, print the summary and exit with the right code. */
	function finish(label = "browser checks") {
		const failed = results.filter((r) => !r.ok);
		writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, pageErrors }, null, 2));
		console.log(`\n${results.length - failed.length}/${results.length} ${label} passed. Screenshots: ${OUT}`);
		process.exit(failed.length ? 1 : 0);
	}

	return {
		DESK_READY,
		BASE,
		OUT,
		USERS,
		sleep,
		results,
		pageErrors,
		evaluate,
		waitFor,
		goto,
		login,
		screenshot,
		state,
		check,
		expect,
		xcall,
		start,
		stop,
		finish,
		get cdp() {
			return cdp;
		},
	};
}
