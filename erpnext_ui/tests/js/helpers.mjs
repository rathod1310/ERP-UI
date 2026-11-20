// Minimal stand-ins for the browser objects the engine uses.

export const TOKEN_NAMES = ["primary", "surface", "text", "radius", "color-scheme"];

export function theme(name, mode, primary = "#294b70") {
	return {
		name,
		key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		mode,
		description: `${name} description`,
		is_standard: 1,
		tokens: {
			primary,
			surface: mode === "Dark" ? "#1c1c1e" : "#ffffff",
			text: mode === "Dark" ? "#e8e8ea" : "#252b36",
			radius: "6px",
			"color-scheme": mode.toLowerCase(),
		},
	};
}

export function makeConfig(overrides = {}) {
	return {
		enabled: 1,
		adapter: "v16",
		debug: 0,
		allow_user_selection: 1,
		can_manage: 0,
		appearance: "Light",
		appearance_source: "default",
		light_theme: "Classic Light",
		dark_theme: "Classic Dark",
		density: "Comfortable",
		font: "Inter",
		saved: {},
		defaults: {
			light_theme: "Classic Light",
			dark_theme: "Classic Dark",
			appearance: "Light",
		},
		token_names: TOKEN_NAMES,
		catalog: [
			theme("Classic Light", "Light"),
			theme("Professional Blue", "Light", "#1d5fa8"),
			theme("Professional Dark", "Dark", "#3674c4"),
			theme("Classic Dark", "Dark", "#4672a1"),
		],
		...overrides,
	};
}

export class FakeElement {
	constructor(tag) {
		this.tagName = tag;
		this.id = "";
		this.textContent = "";
		this.parentNode = null;
		this.children = [];
	}
	appendChild(child) {
		child.parentNode = this;
		this.children.push(child);
		return child;
	}
	removeChild(child) {
		this.children = this.children.filter((c) => c !== child);
		child.parentNode = null;
	}
}

export class FakeRoot {
	constructor(attrs = {}) {
		this.attrs = new Map(Object.entries(attrs));
		this.observers = [];
		this.writes = 0;
	}
	getAttribute(name) {
		return this.attrs.has(name) ? this.attrs.get(name) : null;
	}
	hasAttribute(name) {
		return this.attrs.has(name);
	}
	setAttribute(name, value) {
		this.writes += 1;
		this.attrs.set(name, String(value));
		this._notify(name);
	}
	removeAttribute(name) {
		if (!this.attrs.has(name)) return;
		this.attrs.delete(name);
		this._notify(name);
	}
	_notify(name) {
		for (const obs of this.observers) {
			if (!obs.filter || obs.filter.includes(name)) obs.queue(name);
		}
	}
}

export class FakeDocument {
	constructor(root) {
		this.documentElement = root;
		this.head = new FakeElement("head");
		this.events = [];
	}
	createElement(tag) {
		return new FakeElement(tag);
	}
	getElementById(id) {
		return this.head.children.find((el) => el.id === id) || null;
	}
	dispatchEvent(event) {
		this.events.push(event);
		for (const fn of (this.handlers && this.handlers[event.type]) || []) fn(event);
		return true;
	}
	addEventListener(type, fn) {
		this.handlers = this.handlers || {};
		(this.handlers[type] = this.handlers[type] || []).push(fn);
	}
	removeEventListener(type, fn) {
		if (this.handlers && this.handlers[type])
			this.handlers[type] = this.handlers[type].filter((h) => h !== fn);
	}
	styleElements() {
		return this.head.children.filter((el) => el.tagName === "style");
	}
}

export class FakeCustomEvent {
	constructor(type, init = {}) {
		this.type = type;
		this.detail = init.detail;
	}
}

export function makeMutationObserver(root) {
	return class FakeMutationObserver {
		constructor(callback) {
			this.callback = callback;
			this.pending = false;
		}
		observe(target, options) {
			this.filter = options.attributeFilter;
			target.observers.push(this);
		}
		queue(name) {
			if (this.disconnected) return;
			// Real MutationObservers deliver asynchronously (microtask).
			if (this.pending) return;
			this.pending = true;
			queueMicrotask(() => {
				this.pending = false;
				if (!this.disconnected) this.callback([{ attributeName: name }]);
			});
		}
		disconnect() {
			this.disconnected = true;
			root.observers = root.observers.filter((o) => o !== this);
		}
	};
}

export class FakeMediaQuery {
	constructor(matches = false) {
		this.matches = matches;
		this.listeners = new Set();
	}
	addEventListener(type, fn) {
		this.listeners.add(fn);
	}
	removeEventListener(type, fn) {
		this.listeners.delete(fn);
	}
	set(matches) {
		this.matches = matches;
		for (const fn of this.listeners) fn({ matches });
	}
}

export const fakeAdapter = { key: "v16" };

export function makeEnv({
	attrs = { "data-theme-mode": "light", "data-theme": "light" },
	prefersDark = false,
} = {}) {
	const root = new FakeRoot(attrs);
	const doc = new FakeDocument(root);
	const media = new FakeMediaQuery(prefersDark);
	return {
		root,
		doc,
		media,
		deps: {
			root,
			doc,
			matchMedia: () => media,
			MutationObserver: makeMutationObserver(root),
			CustomEvent: FakeCustomEvent,
			logger: { setDebug() {}, debug() {}, info() {}, warn() {}, error() {} },
		},
	};
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
