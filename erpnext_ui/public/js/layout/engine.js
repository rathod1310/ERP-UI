// The layout engine: applies layout presets and presentation formats by
// setting attributes on <html>. It is separate from the theme engine; it only
// runs while the theme engine is active (the layout CSS needs the adapter's
// html[data-ui-adapter]). All browser objects are passed in.
//
// Attributes owned by the layout engine:
//   data-ui-layout          "enhanced" while the Desk layout layer is on
//   data-ui-nav             "standard" | "compact" | "collapsed"
//   data-ui-workspace       "standard" | "cards" | "compact" | "comfortable"
//   data-ui-form            "standard" | "compact" | "comfortable"
//   data-ui-list            "standard" | "compact" | "comfortable"
//   data-ui-width           "standard" | "full" | "contained" | "narrow"
//   data-ui-cards           "bordered" | "minimal"
//   data-ui-canvas          "tinted" | "plain"
//   data-ui-layout-preview  "1" while an unsaved layout is shown

import { ATTRIBUTES, LAYOUT_KEYS, normaliseLayoutConfig, resolveLayout } from "./resolve.js";

export const LAYOUT_ATTRIBUTES = [
	"data-ui-layout",
	...Object.values(ATTRIBUTES),
	"data-ui-layout-preview",
];

export const LAYOUT_EVENTS = {
	applied: "erpnext-ui:layout-applied",
	preview: "erpnext-ui:layout-preview",
};

export class LayoutEngine {
	constructor({ root, doc, logger, CustomEvent } = {}) {
		this.root = root;
		this.doc = doc;
		this.logger = logger || { debug() {}, info() {}, warn() {}, error() {} };
		this.CustomEvent = CustomEvent;
		this.config = { enabled: false };
		this.adapter = null;
		this.active = false;
		this.previewSelection = null;
		this.current = null;
		this.applyCount = 0;
	}

	/** Start (or restart) with the payload's layout block. */
	init(rawLayout, adapter) {
		this.adapter = adapter || null;
		this.config = normaliseLayoutConfig(rawLayout);
		this.previewSelection = null;
		return this.apply();
	}

	/** New configuration after saving preferences or settings. */
	update(rawLayout) {
		this.config = normaliseLayoutConfig(rawLayout);
		this.previewSelection = null;
		return this.apply();
	}

	get isPreviewing() {
		return Boolean(this.previewSelection);
	}

	/** The saved selection (what the user stored), for editors. */
	savedSelection() {
		return { ...(this.config.saved || {}) };
	}

	/**
	 * Show an unsaved selection on every route until endPreview() or update().
	 * Unknown keys and invalid values are ignored by resolveLayout().
	 * `ignoreAllowed`: the values were already resolved by the server for an
	 * experience (with the site's permissions applied), so use them as given.
	 */
	preview(selection, { ignoreAllowed = false } = {}) {
		if (!this.active) return null;
		const clean = {};
		for (const key of ["layout_preset", ...LAYOUT_KEYS]) {
			if (typeof selection?.[key] === "string") clean[key] = selection[key];
		}
		this.previewSelection = clean;
		this.previewIgnoreAllowed = Boolean(ignoreAllowed);
		const result = this.apply();
		this._emit(LAYOUT_EVENTS.preview, { active: true, ...this.current });
		return result;
	}

	endPreview() {
		if (!this.previewSelection) return false;
		this.previewSelection = null;
		this.apply();
		this._emit(LAYOUT_EVENTS.preview, { active: false });
		return true;
	}

	apply() {
		if (!this.config.enabled || !this.adapter) return this.deactivate();
		const resolved = this.previewSelection
			? resolveLayout(this.config, this.previewSelection, { ignoreAllowed: this.previewIgnoreAllowed })
			: this.config.current;
		for (const key of LAYOUT_KEYS) this._set(ATTRIBUTES[key], resolved.attributes[key]);
		this._set("data-ui-layout-preview", this.previewSelection ? "1" : null);
		this._set("data-ui-layout", "enhanced");
		const before = this.current && this.current.attributes.navigation;
		this.active = true;
		this.applyCount += 1;
		this.current = { ...resolved, preview: Boolean(this.previewSelection) };
		if (before !== resolved.attributes.navigation) this._navigation(resolved.attributes.navigation);
		this._emit(LAYOUT_EVENTS.applied, this.current);
		return this.current;
	}

	deactivate() {
		const wasCollapsed = this.current && this.current.attributes.navigation === "collapsed";
		for (const name of LAYOUT_ATTRIBUTES) {
			if (this.root.hasAttribute(name)) this.root.removeAttribute(name);
		}
		if (wasCollapsed) this._navigation("standard");
		this.active = false;
		this.current = null;
		this.previewSelection = null;
		return null;
	}

	_navigation(mode) {
		if (!this.adapter || typeof this.adapter.applyNavigation !== "function") return;
		try {
			this.adapter.applyNavigation(mode);
		} catch (e) {
			this.logger.error("navigation mode not applied", e);
		}
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
