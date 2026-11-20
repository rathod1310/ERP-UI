// The experience engine: marks <html> with the active Experience Pack and its
// shell component variants, and points Desk's home route at the pack's home.
// Theme and layout are applied by their own engines; the customization
// session drives all three together. All browser objects are passed in.
//
// Attributes owned by this engine:
//   data-ui-x               the pack key (diagnostics and tests only; CSS
//                           never keys on it)
//   data-ui-shell-<c>       one variant per shell component: nav, header,
//                           launcher, home, form, list, report
//   data-ui-x-preview       "1" while an unsaved experience is shown

import { HOME_PAGE, SHELL_ATTRIBUTES, findPack, normaliseExperience } from "./resolve.js";

// Frappe's apps screen. Back, Home and old links that land on it open the
// experience home instead; only "All apps" opens it (allowLauncherOnce).
export const LAUNCHER_PAGE = "desktop";
const LAUNCHER_PASS_MS = 10000;

export const EXPERIENCE_EVENTS = { applied: "erpnext-ui:experience-applied" };
export const EXPERIENCE_ATTRIBUTES = ["data-ui-x", "data-ui-x-preview", ...Object.values(SHELL_ATTRIBUTES)];

export class ExperienceEngine {
	constructor({ root, doc, logger, CustomEvent, boot, goHome } = {}) {
		this.root = root;
		this.doc = doc;
		this.logger = logger || { debug() {}, info() {}, warn() {}, error() {} };
		this.CustomEvent = CustomEvent;
		this.boot = boot || null; // frappe.boot, for home_page
		// Replaces the current history entry with the home route (see
		// bootstrap.js: frappe.route_flags.replace_route + set_route("")).
		// While an experience home is active, Frappe's own launcher route
		// ("desktop", reached from bookmarks and old links) leads to that home.
		this.goHome = goHome || null;
		this.config = null;
		this.previewKey = null;
		this.active = false;
		this.current = null;
		this.nativeHome = null;
		this.launcherPass = false;
	}

	init(raw) {
		this.config = normaliseExperience(raw);
		if (this.config && this.config.native_home_page) this.nativeHome = this.config.native_home_page;
		else if (this.boot && this.boot.home_page !== HOME_PAGE) this.nativeHome = this.boot.home_page;
		this.previewKey = null;
		return this.apply();
	}

	/** New configuration from the server (API responses lack native_home_page). */
	update(raw) {
		const config = normaliseExperience(raw);
		if (config && !config.native_home_page) config.native_home_page = this.nativeHome;
		this.config = config;
		this.previewKey = null;
		return this.apply();
	}

	get isPreviewing() {
		return Boolean(this.previewKey);
	}

	preview(key) {
		if (!this.config || !findPack(this.config, key)) return null;
		this.previewKey = key === this.config.key ? null : key;
		return this.apply();
	}

	endPreview() {
		if (!this.previewKey) return false;
		this.previewKey = null;
		this.apply();
		return true;
	}

	/** The pack being shown (the previewed one, or the saved one). */
	shown() {
		if (!this.config) return null;
		return findPack(this.config, this.previewKey || this.config.key);
	}

	apply() {
		const pack = this.shown();
		if (!pack) return this.deactivate();
		this._set("data-ui-x", pack.key);
		for (const [component, attr] of Object.entries(SHELL_ATTRIBUTES))
			this._set(attr, pack.shell[component]);
		this._set("data-ui-x-preview", this.previewKey ? "1" : null);
		this._home(pack);
		this.active = true;
		this.current = { key: pack.key, title: pack.title, shell: { ...pack.shell }, preview: Boolean(this.previewKey) };
		this._emit(EXPERIENCE_EVENTS.applied, this.current);
		return this.current;
	}

	deactivate() {
		for (const name of EXPERIENCE_ATTRIBUTES) {
			if (this.root.hasAttribute(name)) this.root.removeAttribute(name);
		}
		if (this.boot && this.nativeHome && this.boot.home_page === HOME_PAGE)
			this.boot.home_page = this.nativeHome;
		this.active = false;
		this.current = null;
		this.previewKey = null;
		return null;
	}

	/** Desk resolves the empty route through frappe.boot.home_page. */
	_home(pack) {
		if (!this.boot || !this.nativeHome || this.nativeHome === "setup-wizard") return;
		const available = this.config && this.config.home_available;
		const own = Boolean(pack.custom_home && available);
		this.boot.home_page = own ? HOME_PAGE : this.nativeHome;
	}

	/**
	 * Where "All apps" goes: the experience's own apps page when the site has
	 * it, otherwise Frappe's apps screen (let through once).
	 */
	allAppsRoute() {
		const page = this.active && this.config && this.config.apps_page;
		if (page) return page;
		this.allowLauncherOnce();
		return LAUNCHER_PAGE;
	}

	/** The next visit to the launcher is shown, not redirected. */
	allowLauncherOnce() {
		this.launcherPass = Date.now();
	}

	/** True while the experience has its own home that replaces Frappe's launcher. */
	get ownsHome() {
		return Boolean(this.active && this.boot && this.boot.home_page === HOME_PAGE);
	}

	/**
	 * Called on every Desk route change. Frappe's launcher page (the native
	 * home, "desktop" on v16) is replaced by the experience home; every other
	 * route is left alone. Returns true when it redirected.
	 */
	onRouteChange(route) {
		const first = Array.isArray(route) ? route[0] : route;
		if (!this.ownsHome || !this.goHome || !this.nativeHome) return false;
		if (this.nativeHome === HOME_PAGE || this.nativeHome === "setup-wizard") return false;
		if (first !== this.nativeHome && first !== LAUNCHER_PAGE) return false;
		// "All apps" asked for the launcher on purpose: show it this once.
		if (this.launcherPass && Date.now() - this.launcherPass < LAUNCHER_PASS_MS) {
			this.launcherPass = false;
			return false;
		}
		this.launcherPass = false;
		try {
			this.goHome();
		} catch (e) {
			this.logger.error("could not open the experience home", e);
			return false;
		}
		return true;
	}

	_set(name, value) {
		if (value === null || value === undefined || value === "") {
			if (this.root.hasAttribute(name)) this.root.removeAttribute(name);
		} else if (this.root.getAttribute(name) !== value) {
			this.root.setAttribute(name, value);
		}
	}

	_emit(name, detail) {
		if (!this.CustomEvent || !this.doc || !this.doc.dispatchEvent) return;
		try {
			this.doc.dispatchEvent(new this.CustomEvent(name, { detail }));
		} catch (e) {
			this.logger.error("event listener failed", e);
		}
	}
}
