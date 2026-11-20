// Server calls for preferences and global defaults. Each successful call
// returns the new effective configuration, which is handed to both engines
// (theme and layout).

import { LAYOUT_KEYS } from "../experience/resolve.js";

const API = {
	config: "erpnext_ui.api.theme.get_config",
	previewCatalog: "erpnext_ui.api.theme.preview_catalog",
	save: "erpnext_ui.api.preferences.save_preferences",
	restore: "erpnext_ui.api.preferences.restore_experience",
	reset: "erpnext_ui.api.preferences.reset_preferences",
	publish: "erpnext_ui.api.settings.publish_defaults",
	resetSettings: "erpnext_ui.api.settings.reset_settings",
};

const SELECTION_KEYS = ["experience", "light_theme", "dark_theme", "appearance", "density", "font"];

/** Experience and theme keys only when set; layout keys also when "" (back to the pack's value). */
export function pick(selection) {
	const out = {};
	for (const key of SELECTION_KEYS) {
		if (selection && selection[key]) out[key] = selection[key];
	}
	for (const key of LAYOUT_KEYS) {
		if (selection && typeof selection[key] === "string") out[key] = selection[key];
	}
	return out;
}

export class PreferencesClient {
	constructor(engine, frappe, layoutEngine = null, experienceEngine = null) {
		this.engine = engine;
		this.frappe = frappe;
		this.layoutEngine = layoutEngine;
		this.experienceEngine = experienceEngine;
	}

	async _call(method, args, type = "POST") {
		const config = await this.frappe.xcall(method, args, type);
		this.engine.update(config);
		if (this.layoutEngine) {
			if (this.engine.active) this.layoutEngine.update(config.layout);
			else this.layoutEngine.deactivate();
		}
		if (this.experienceEngine) {
			if (this.engine.active) this.experienceEngine.update(config.experience);
			else this.experienceEngine.deactivate();
		}
		return config;
	}

	refresh() {
		return this._call(API.config, {}, "GET");
	}

	/** Save for the current user only. */
	save(selection) {
		return this._call(API.save, pick(selection));
	}

	/**
	 * Record an appearance already applied in the page (from Frappe's own
	 * Toggle Theme dialog). The engine has applied it; only the server record
	 * is updated, so the page is not re-rendered.
	 */
	recordAppearance(appearance) {
		return this.frappe.xcall(API.save, { appearance }).catch(() => null);
	}

	/** Forget the current user's adjustments to one experience. */
	restoreExperience(key) {
		return this._call(API.restore, key ? { experience: key } : {});
	}

	/** Forget the current user's choices; site defaults apply again. */
	reset() {
		return this._call(API.reset, {});
	}

	/** Make a selection the site default (settings managers only). */
	publishDefaults(selection) {
		return this._call(API.publish, pick(selection));
	}

	resetSettings() {
		return this._call(API.resetSettings, {});
	}

	/** Themes resolved with an unsaved accent; nothing is stored. */
	previewCatalog(accentColor) {
		return this.frappe.xcall(API.previewCatalog, { accent_color: accentColor || null });
	}
}
