// Frappe v16 Desk integration. Everything version-specific about the DOM or
// Frappe's client APIs lives here, not in the theme engine. The Desk layout
// layer (Phase 2) is mostly CSS (css/adapters/v16/); its scripts are the
// sidebar navigation helper and the "Collapsed" navigation mode (Phase 3).

import { SidebarNavigation } from "./v16/navigation.js";

const MENU_ROUTE = "/app/ui-preferences";

export const v16Adapter = {
	key: "v16",

	/** Feature detection on top of the server's version check. */
	detect(env) {
		const f = env && env.frappe;
		return Boolean(
			f &&
				f.ui &&
				typeof f.ui.set_theme === "function" &&
				f.router &&
				typeof f.router.on === "function" &&
				f.boot
		);
	},

	install(engine, env) {
		if (this._installed) return false;
		this._installed = true;
		this._env = env;
		const f = env.frappe;

		this.routeListeners = this.routeListeners || [];
		f.router.on("change", () => {
			try {
				engine.onRouteChange(
					typeof f.get_route_str === "function" ? f.get_route_str() : undefined
				);
			} catch (e) {
				engine.logger.error("route change handler failed", e);
			}
		});
		// "page-change" is triggered by Frappe's page container after a page is
		// actually shown (views/container.js), so listeners see the page that
		// won, even when a page loaded its code asynchronously.
		const $ = env.win && (env.win.jQuery || env.win.$);
		if ($ && env.win.document) {
			$(env.win.document).on("page-change", () => {
				const route = typeof f.get_route === "function" ? f.get_route() : [];
				for (const fn of this.routeListeners) {
					try {
						fn(route);
					} catch (e) {
						engine.logger.error("page listener failed", e);
					}
				}
			});
		}

		this.addMenuItem(f);
		this.installNavigation(engine, env);
		this.markVersion(f, env);
		return true;
	},

	/** html[data-ui-frappe="<major>"] for the few rules that differ between v16 and v17. */
	markVersion(f, env) {
		const major = f.boot && f.boot.erpnext_ui && f.boot.erpnext_ui.frappe_major;
		const root = env.win && env.win.document && env.win.document.documentElement;
		if (root && major) root.setAttribute("data-ui-frappe", String(major));
	},

	/**
	 * "All apps" opens the route `resolveRoute()` returns (the experience's
	 * own apps page, or Frappe's apps screen). v17 builds the row in
	 * SidebarHeader.all_apps_item, whose href is the empty route (the home),
	 * so the row is given an action instead. Elsewhere a click on a row
	 * labelled "All apps" is redirected the same way.
	 */
	installAllApps(resolveRoute) {
		const env = this._env || {};
		const f = env.frappe;
		const win = env.win;
		if (!f || this._allAppsInstalled) return false;
		this._allAppsInstalled = true;
		const open = () => f.set_route(resolveRoute());
		const Header = f.ui && f.ui.SidebarHeader;
		if (Header && Header.prototype && typeof Header.prototype.all_apps_item === "function") {
			const original = Header.prototype.all_apps_item;
			Header.prototype.all_apps_item = function () {
				const item = { ...original.call(this) };
				delete item.href;
				item.onclick = open;
				return item;
			};
			return true;
		}
		const doc = win && win.document;
		if (!doc) return false;
		const label = (typeof win.__ === "function" ? win.__("All apps") : "All apps").trim();
		doc.addEventListener(
			"click",
			(event) => {
				const row = event.target && event.target.closest && event.target.closest("a, button, [role='menuitem']");
				if (!row || (row.textContent || "").trim() !== label) return;
				event.preventDefault();
				event.stopPropagation();
				open();
			},
			true
		);
		return true;
	},

	/** Run `fn(route)` after every Desk page change (one document listener in all). */
	addRouteListener(fn) {
		this.routeListeners = this.routeListeners || [];
		if (typeof fn === "function" && !this.routeListeners.includes(fn)) this.routeListeners.push(fn);
	},

	/**
	 * Navigation mode from the layout engine. "collapsed" collapses the native
	 * sidebar through Frappe's own API (or, before the sidebar exists, its
	 * stored state), so the user can still expand it. Leaving "collapsed"
	 * re-expands only a sidebar this adapter collapsed. Phones keep Frappe's
	 * own behaviour (the sidebar is an overlay there).
	 */
	applyNavigation(mode) {
		const env = this._env || {};
		const f = env.frappe;
		const win = env.win;
		if (!f || (typeof f.is_mobile === "function" && f.is_mobile())) return false;
		const sidebar = f.app && f.app.sidebar;
		const store = (value) => {
			try {
				win && win.localStorage && win.localStorage.setItem("sidebar-expanded", value);
			} catch (e) {
				/* storage blocked: the sidebar keeps its own state */
			}
		};
		if (mode === "collapsed") {
			if (sidebar && typeof sidebar.close === "function") {
				if (sidebar.sidebar_expanded) {
					sidebar.close();
					this._collapsedByLayout = true;
				}
			} else {
				store("false");
				this._collapsedByLayout = true;
			}
			return true;
		}
		if (!this._collapsedByLayout) return false;
		this._collapsedByLayout = false;
		if (sidebar && typeof sidebar.open === "function") {
			if (!sidebar.sidebar_expanded) sidebar.open();
		} else {
			store("true");
		}
		return true;
	},

	installNavigation(engine, env) {
		const win = env.win || (typeof window !== "undefined" ? window : null);
		if (!win || !win.document) return null;
		try {
			this.navigation = new SidebarNavigation({
				doc: win.document,
				$: win.jQuery || win.$,
				translate: win.__,
				logger: engine.logger,
			});
			this.navigation.install();
		} catch (e) {
			engine.logger.error("sidebar navigation not installed", e);
			this.navigation = null;
		}
		return this.navigation;
	},

	/**
	 * Add "Appearance & Theme" to the user menu by extending the in-memory
	 * Navbar Settings rows before the sidebar header renders. Navbar Settings
	 * itself is not modified.
	 */
	addMenuItem(f) {
		const dropdown = f.boot.navbar_settings && f.boot.navbar_settings.settings_dropdown;
		if (!Array.isArray(dropdown)) return false;
		if (dropdown.some((item) => item && item.route === MENU_ROUTE)) return false;
		const label =
			typeof window !== "undefined" && window.__
				? window.__("Appearance & Theme")
				: "Appearance & Theme";
		const item = { item_label: label, item_type: "Route", route: MENU_ROUTE, icon: "palette" };
		// Right after Frappe's own "Toggle Theme" entry when it is present.
		const toggleIndex = dropdown.findIndex(
			(row) => row && /toggle.*theme/i.test(row.item_label || "")
		);
		if (toggleIndex >= 0) dropdown.splice(toggleIndex + 1, 0, item);
		else dropdown.push(item);
		return true;
	},
};
