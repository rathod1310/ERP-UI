// The theme engine: writes the active theme's tokens into one <style> element
// and marks <html> with data-ui-* attributes. All browser objects are passed
// in, so the engine can be tested without a browser.
//
// Attributes owned by the engine:
//   data-ui-theme    key of the active theme (selects the token rule)
//   data-ui-mode     "light" | "dark"
//   data-ui-density  "compact" | "comfortable" | "spacious"
//   data-ui-font     "inter" | "system" | "humanist"
//   data-ui-preview  "1" while an unsaved preview is shown
//   data-ui-adapter  set last; switches the Desk adapter CSS on
// Shared with Frappe (same meaning as native Desk):
//   data-theme-mode  "light" | "dark" | "automatic"
//   data-theme       "light" | "dark"
//   data-ui-t-*      the theme's recipe: sidebar, navbar, surface, input, table,
//                    button, backdrop, heading, numerals (Phase 3 M2)
//   data-ui-backdrop-through  "1" when backdrops show through sidebar and header
// Layout attributes (data-ui-layout, data-ui-nav, ...) belong to the layout
// engine (layout/engine.js).

import { buildThemeCss, STYLE_ELEMENT_ID } from "./tokens.js";
import {
	appearanceFromAttribute,
	FONT_KEYS,
	normaliseConfig,
	RECIPE_ATTRIBUTES,
	resolveTheme,
	sanitisePreview,
	sanitiseRecipe,
	selectionFor,
} from "./resolve.js";

const OWNED_ATTRIBUTES = [
	"data-ui-adapter",
	"data-ui-theme",
	"data-ui-mode",
	"data-ui-density",
	"data-ui-font",
	"data-ui-preview",
	"data-ui-backdrop-through",
	...RECIPE_ATTRIBUTES.map((name) => `data-ui-t-${name}`),
];

export const EVENTS = {
	applied: "erpnext-ui:applied",
	deactivated: "erpnext-ui:deactivated",
	preview: "erpnext-ui:preview",
};

export class ThemeEngine {
	constructor({ root, doc, matchMedia, MutationObserver, logger, CustomEvent } = {}) {
		this.root = root;
		this.doc = doc;
		this.logger = logger || { debug() {}, info() {}, warn() {}, error() {} };
		this.MutationObserver = MutationObserver;
		this.CustomEvent = CustomEvent;
		this.mediaQuery = null;
		try {
			this.mediaQuery = matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
		} catch (e) {
			this.mediaQuery = null;
		}
		this.config = { enabled: false, reason: "not-initialised" };
		this.adapter = null;
		this.previewState = null;
		this.initialized = false;
		this.listening = false;
		this.active = false;
		this.reason = "not-initialised";
		this.current = null;
		this.applyCount = 0;
		// Set by bootstrap: persists an appearance chosen in Frappe's own dialog.
		this.onAppearanceChange = null;
	}

	/** Initialise once. Later calls are ignored and return false. */
	init(rawConfig, adapter) {
		if (this.initialized) {
			this.logger.debug("init ignored: already initialised");
			return false;
		}
		this.initialized = true;
		this.adapter = adapter || null;
		this.config = normaliseConfig(rawConfig);
		this.logger.setDebug && this.logger.setDebug(this.config.debug);
		this._activateOrDeactivate();
		return true;
	}

	/** Replace the configuration (after saving preferences or settings). */
	update(rawConfig) {
		this.config = normaliseConfig(rawConfig);
		this.previewState = null;
		this.logger.setDebug && this.logger.setDebug(this.config.debug);
		this._activateOrDeactivate();
		return this.active;
	}

	_activateOrDeactivate() {
		if (!this.config.enabled) return this.deactivate(this.config.reason || "disabled");
		if (!this.adapter) return this.deactivate("unsupported-version");
		if (this.apply()) this._listen();
	}

	prefersDark() {
		return Boolean(this.mediaQuery && this.mediaQuery.matches);
	}

	selection() {
		return selectionFor(this.config, this.previewState);
	}

	apply() {
		if (!this.config.enabled || !this.adapter) return null;
		const selection = this.selection();
		const catalog = (this.previewState && this.previewState.catalog) || this.config.catalog;
		const resolved = resolveTheme(this.config, selection, this.prefersDark(), catalog);
		if (!resolved) {
			this.logger.warn("no complete theme available; native Desk styling kept");
			this.deactivate("no-valid-theme");
			return null;
		}

		this._styleElement().textContent = buildThemeCss(resolved.theme.key, resolved.tokens);
		this._set("data-ui-theme", resolved.theme.key);
		this._set("data-ui-mode", resolved.mode);
		this._set("data-ui-density", String(selection.density || "Comfortable").toLowerCase());
		this._set("data-ui-font", FONT_KEYS[selection.font] || "inter");
		this._set("data-ui-preview", this.previewState ? "1" : null);
		this._applyRecipe(resolved.theme.recipe);
		if (!selection.force_mode) {
			this._set("data-theme-mode", String(selection.appearance).toLowerCase());
		}
		this._set("data-theme", resolved.mode);
		this._set("data-ui-adapter", this.adapter.key);

		this.active = true;
		this.reason = null;
		this.applyCount += 1;
		this.current = {
			theme: resolved.theme.name,
			key: resolved.theme.key,
			mode: resolved.mode,
			appearance: selection.appearance,
			density: selection.density,
			font: selection.font,
			fallback: resolved.fallback,
			preview: Boolean(this.previewState),
		};
		if (resolved.fallback) this.logger.debug("using fallback theme", resolved.theme.name);
		this._emit(EVENTS.applied, this.current);
		return this.current;
	}

	/** Show an unsaved selection. Ends automatically on update() or route change. */
	preview(overrides) {
		if (!this.active) return false;
		this.previewState = sanitisePreview(overrides);
		const result = this.apply();
		this._emit(EVENTS.preview, { active: true, ...this.current });
		return Boolean(result);
	}

	endPreview() {
		if (!this.previewState) return false;
		this.previewState = null;
		this.apply();
		this._emit(EVENTS.preview, { active: false });
		return true;
	}

	get isPreviewing() {
		return Boolean(this.previewState);
	}

	/** Called by the adapter on every Desk route change. Cheap by design. */
	onRouteChange(route) {
		if (
			this.previewState &&
			this.previewState.route !== undefined &&
			this.previewState.route !== route
		) {
			this.endPreview();
		}
		if (this.active && !this.root.getAttribute("data-ui-adapter")) {
			this.logger.debug("engine attributes missing after route change; reapplying");
			this.apply();
		}
	}

	deactivate(reason) {
		for (const name of OWNED_ATTRIBUTES) this.root.removeAttribute(name);
		const el = this.doc.getElementById(STYLE_ELEMENT_ID);
		if (el && el.parentNode) el.parentNode.removeChild(el);
		const wasActive = this.active;
		this.active = false;
		this.reason = reason || "disabled";
		this.current = null;
		this.previewState = null;
		if (wasActive) this._emit(EVENTS.deactivated, { reason: this.reason });
		this.logger.debug("inactive:", this.reason);
		return null;
	}

	destroy() {
		this.deactivate("destroyed");
		if (this.observer) this.observer.disconnect();
		if (this.mediaQuery && this._onMediaChange) {
			try {
				this.mediaQuery.removeEventListener("change", this._onMediaChange);
			} catch (e) {
				/* old browsers */
			}
		}
		this.observer = null;
		this.listening = false;
		this.initialized = false;
	}

	_listen() {
		if (this.listening) return;
		this.listening = true;

		// Frappe's own Toggle Theme dialog writes data-theme-mode. Follow it so
		// the matching light or dark theme is shown.
		if (this.MutationObserver) {
			this.observer = new this.MutationObserver(() => this._onModeAttribute());
			this.observer.observe(this.root, {
				attributes: true,
				attributeFilter: ["data-theme-mode"],
			});
		}

		this._onMediaChange = () => {
			if (this.active && this.selection().appearance === "Automatic") this.apply();
		};
		if (this.mediaQuery) {
			if (this.mediaQuery.addEventListener)
				this.mediaQuery.addEventListener("change", this._onMediaChange);
			else if (this.mediaQuery.addListener) this.mediaQuery.addListener(this._onMediaChange);
		}
	}

	_onModeAttribute() {
		if (!this.active || (this.previewState && this.previewState.force_mode)) return;
		const appearance = appearanceFromAttribute(this.root.getAttribute("data-theme-mode"));
		if (!appearance) return;
		if (this.previewState && this.previewState.appearance) {
			if (appearance === this.previewState.appearance) return;
			this.previewState.appearance = appearance;
		} else {
			if (appearance === this.config.appearance) return;
			this.config.appearance = appearance;
			this.config.appearance_source = "user";
			if (this.onAppearanceChange) {
				try {
					this.onAppearanceChange(appearance);
				} catch (e) {
					this.logger.error("could not record appearance", e);
				}
			}
		}
		this.apply();
	}

	/** Recipe attributes of the active theme; backdrops follow the site switch. */
	_applyRecipe(raw) {
		const recipe = sanitiseRecipe(raw);
		const backdrops = this.config.backdrops || { enabled: true };
		if (!backdrops.enabled && recipe.backdrop) recipe.backdrop = "none";
		for (const name of RECIPE_ATTRIBUTES) this._set(`data-ui-t-${name}`, recipe[name] || null);
		const through = backdrops.through_panels && recipe.backdrop && recipe.backdrop !== "none";
		this._set("data-ui-backdrop-through", through ? "1" : null);
	}

	_styleElement() {
		let el = this.doc.getElementById(STYLE_ELEMENT_ID);
		if (!el) {
			el = this.doc.createElement("style");
			el.id = STYLE_ELEMENT_ID;
			(this.doc.head || this.doc.documentElement).appendChild(el);
		}
		return el;
	}

	_set(name, value) {
		if (value === null || value === undefined || value === "") {
			if (this.root.hasAttribute(name)) this.root.removeAttribute(name);
		} else if (this.root.getAttribute(name) !== value) {
			this.root.setAttribute(name, value);
		}
	}

	_emit(name, detail) {
		if (!this.CustomEvent || !this.doc.dispatchEvent) return;
		try {
			this.doc.dispatchEvent(new this.CustomEvent(name, { detail }));
		} catch (e) {
			this.logger.error("event listener failed", e);
		}
	}
}
