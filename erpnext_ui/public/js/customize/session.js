// One customization session: the user's unsaved experience and adjustments.
//
// The draft is a complete selection: the experience key, the appearance, the
// theme choices (light/dark theme, density, font) and the seven layout values.
// Picking an experience replaces the whole draft with that pack's values (as
// the server resolved them, including this user's saved adjustments to it).
// The draft is previewed through all three engines (experience, theme,
// layout) and stays visible on every Desk route until it is saved or
// cancelled. Nothing is stored until save(). Cancel restores exactly what was
// showing before.

import { LAYOUT_KEYS, THEME_KEYS as PACK_THEME_KEYS, draftFor } from "../experience/resolve.js";
import { resolveMode } from "../theme/resolve.js";

export const THEME_KEYS = ["appearance", ...PACK_THEME_KEYS];
export const DRAFT_KEYS = ["experience", ...THEME_KEYS, ...LAYOUT_KEYS];
export const SESSION_EVENT = "erpnext-ui:customize";

export class CustomizationSession {
	constructor({ themeEngine, layoutEngine, experienceEngine, preferences, doc, CustomEvent }) {
		this.theme = themeEngine;
		this.layout = layoutEngine;
		this.experience = experienceEngine || null;
		this.preferences = preferences;
		this.doc = doc;
		this.CustomEvent = CustomEvent;
		this.saved = null;
		this.draft = null;
		this.focusMode = null;
	}

	get experienceConfig() {
		return this.experience && this.experience.config;
	}

	/** Snapshot what is saved now. Keeps a running preview if there is one. */
	begin() {
		if (this.saved && this.isDirty()) return this;
		const c = this.theme.config || {};
		const saved = {};
		for (const key of THEME_KEYS) saved[key] = c[key];
		const layoutValues = (this.layout.active && this.layout.config.current && this.layout.config.current.values) || {};
		for (const key of LAYOUT_KEYS) saved[key] = layoutValues[key] || "";
		saved.experience = (this.experienceConfig && this.experienceConfig.key) || "";
		this.saved = saved;
		this.draft = { ...saved };
		this.focusMode = null;
		this._emit();
		return this;
	}

	get layoutEnabled() {
		return Boolean(this.layout.active);
	}

	/** Change one adjustment. A theme slot also shows that theme in its own mode. */
	set(key, value) {
		if (!this.draft || this.draft[key] === value) return false;
		if (key === "experience") return this.setExperience(value);
		this.draft[key] = value;
		if (key === "light_theme") this.focusMode = "light";
		else if (key === "dark_theme") this.focusMode = "dark";
		else if (key === "appearance") this.focusMode = null;
		this.preview();
		return true;
	}

	/** Pick an experience: the whole draft becomes that pack's values. */
	setExperience(key) {
		const values = draftFor(this.experienceConfig, key);
		if (!this.draft || !values) return false;
		this.draft = { ...this.draft, ...values };
		for (const k of LAYOUT_KEYS) if (!(k in values)) this.draft[k] = this.saved[k];
		this.focusMode = null;
		this.preview();
		return true;
	}

	changedKeys() {
		if (!this.draft) return [];
		return Object.keys(this.draft).filter((k) => this.draft[k] !== this.saved[k]);
	}

	isDirty() {
		return this.changedKeys().length > 0;
	}

	preview() {
		const themeChanged = THEME_KEYS.some((k) => this.draft[k] !== this.saved[k]);
		if (themeChanged || this.focusMode) {
			const effective = resolveMode(this.draft.appearance, this.theme.prefersDark());
			const force = this.focusMode && this.focusMode !== effective ? this.focusMode : undefined;
			const selection = {};
			for (const key of THEME_KEYS) selection[key] = this.draft[key];
			// No route: the preview stays on every page until save or cancel.
			this.theme.preview({ ...selection, force_mode: force });
		} else {
			this.theme.endPreview();
		}
		if (this.layout.active) {
			if (LAYOUT_KEYS.some((k) => this.draft[k] !== this.saved[k])) {
				const selection = {};
				for (const key of LAYOUT_KEYS) selection[key] = this.draft[key];
				// Values come from the server's resolution of the pack, or from
				// controls the page only enables for open groups.
				this.layout.preview(selection, { ignoreAllowed: true });
			} else {
				this.layout.endPreview();
			}
		}
		if (this.experience) {
			if (this.draft.experience && this.draft.experience !== this.saved.experience)
				this.experience.preview(this.draft.experience);
			else this.experience.endPreview();
		}
		this._emit();
	}

	/** Drop the draft and show the saved configuration again. */
	cancel() {
		this.theme.endPreview();
		this.layout.endPreview();
		if (this.experience) this.experience.endPreview();
		if (this.saved) this.draft = { ...this.saved };
		this.focusMode = null;
		this._emit();
	}

	/**
	 * Store the draft for the current user: the experience (if it changed) and
	 * every changed adjustment. The server keeps only values that differ from
	 * the pack, and refuses keys the site does not open.
	 */
	async save() {
		const changed = this.changedKeys();
		const payload = {};
		const allowTheme = Boolean(this.theme.config.allow_user_selection);
		const switching = changed.includes("experience");
		for (const key of changed) {
			if (key === "experience" || key === "appearance") payload[key] = this.draft[key];
			else if (PACK_THEME_KEYS.includes(key)) {
				// Switching packs changes these to the new pack's own values,
				// which the server would drop anyway; send them only when open.
				if (allowTheme) payload[key] = this.draft[key];
			} else payload[key] = this.draft[key];
		}
		if (switching && !allowTheme) for (const key of PACK_THEME_KEYS) delete payload[key];
		if (Object.keys(payload).length) await this.preferences.save(payload);
		this.saved = null;
		this.begin();
		return payload;
	}

	/** Forget the adjustments to one experience (default: the one in the draft). */
	async restore(key) {
		this.cancel();
		await this.preferences.restoreExperience(key || (this.draft && this.draft.experience));
		this.saved = null;
		this.begin();
	}

	_emit() {
		if (!this.CustomEvent || !this.doc) return;
		try {
			this.doc.dispatchEvent(
				new this.CustomEvent(SESSION_EVENT, {
					detail: {
						dirty: this.isDirty(),
						changed: this.changedKeys(),
						experience: this.draft && this.draft.experience,
					},
				})
			);
		} catch (e) {
			/* listeners must not break the session */
		}
	}
}
