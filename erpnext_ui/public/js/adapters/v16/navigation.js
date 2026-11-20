// Sidebar navigation helpers for the v16 Desk (Module B).
//
// 1. A filter box above the workspace sidebar items, shown only when the
//    sidebar is long enough to need one. It hides non-matching items with a
//    class; it never removes items, changes routes or touches the native
//    collapsed state, and it only sees items Frappe already rendered for this
//    user (so role and workspace permissions are unaffected).
// 2. The full label as a tooltip on truncated items.
//
// Frappe re-renders the items on every workspace change and announces it with
// the document event "sidebar_setup"; the filter box sits outside the item
// list, so it survives re-renders and is only reset.

export const FILTER_THRESHOLD = 10;
const ITEM = ".sidebar-item-container";
const LABEL = ".sidebar-item-label";

export function normalise(text) {
	return String(text || "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Apply a query to a sidebar item list. Pure DOM logic, testable without
 * Frappe. Returns the number of visible top-level items.
 */
export function applyFilter(itemsRoot, query) {
	const q = normalise(query);
	let visible = 0;
	for (const item of itemsRoot.querySelectorAll(`:scope > ${ITEM}`)) {
		if (matchItem(item, q)) visible += 1;
	}
	return visible;
}

function ownLabel(item) {
	const anchor = item.querySelector(":scope > .standard-sidebar-item");
	const label = anchor && anchor.querySelector(LABEL);
	return normalise(label ? label.textContent : "");
}

function matchItem(item, q) {
	const nested = item.querySelector(":scope > .nested-container");
	const children = nested ? [...nested.querySelectorAll(`:scope > ${ITEM}`)] : [];
	const selfMatch = !q || ownLabel(item).includes(q);
	let childMatch = false;
	for (const child of children) {
		// A matching section shows (and resets) all its children; otherwise
		// children filter on their own.
		childMatch = matchItem(child, selfMatch ? "" : q) || childMatch;
	}
	const show = selfMatch || childMatch;
	item.classList.toggle("ui-nav-hidden", !show);
	// Open a collapsed section only when the match is inside it.
	if (nested) nested.classList.toggle("ui-nav-reveal", Boolean(q) && !selfMatch && childMatch);
	return show;
}

export class SidebarNavigation {
	constructor({ doc, $, translate, logger }) {
		this.doc = doc;
		this.$ = $;
		this.__ = translate || ((s) => s);
		this.logger = logger;
		this.installed = false;
		this.box = null;
		this.input = null;
		this.empty = null;
		this._onSetup = () => this.schedule();
		this._onOver = (event) => this.titleOnOverflow(event);
	}

	install() {
		if (this.installed) return false;
		this.installed = true;
		if (this.$) this.$(this.doc).on("sidebar_setup", this._onSetup);
		this.doc.addEventListener("mouseover", this._onOver, { passive: true });
		this.schedule();
		return true;
	}

	uninstall() {
		if (!this.installed) return;
		if (this.$) this.$(this.doc).off("sidebar_setup", this._onSetup);
		this.doc.removeEventListener("mouseover", this._onOver);
		this.clear();
		if (this.box && this.box.parentNode) this.box.parentNode.removeChild(this.box);
		this.box = this.input = this.empty = null;
		this.installed = false;
	}

	/** "sidebar_setup" fires before the items render; refresh after them. */
	schedule() {
		const win = this.doc.defaultView;
		const run = () => {
			try {
				this.refresh();
			} catch (e) {
				this.logger && this.logger.error("sidebar filter refresh failed", e);
			}
		};
		if (win && win.requestAnimationFrame) win.requestAnimationFrame(() => setTimeout(run, 0));
		else setTimeout(run, 0);
	}

	itemsRoot() {
		return this.doc.querySelector(".body-sidebar .body-sidebar-top .sidebar-items");
	}

	refresh() {
		const items = this.itemsRoot();
		if (!items) return false;
		this.ensureBox(items);
		const count = items.querySelectorAll(ITEM).length;
		this.box.hidden = count < FILTER_THRESHOLD;
		this.clear();
		return !this.box.hidden;
	}

	ensureBox(items) {
		if (this.box && this.box.isConnected) return;
		const box = this.doc.createElement("div");
		box.className = "ui-nav-filter";
		const input = this.doc.createElement("input");
		input.type = "search";
		input.placeholder = this.__("Filter menu");
		input.setAttribute("aria-label", this.__("Filter sidebar menu"));
		input.autocomplete = "off";
		const empty = this.doc.createElement("div");
		empty.className = "ui-nav-filter-empty";
		empty.hidden = true;
		empty.textContent = this.__("No matching menu items");
		box.appendChild(input);
		box.appendChild(empty);
		items.parentNode.insertBefore(box, items);
		input.addEventListener("input", () => this.filter(input.value));
		input.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				input.value = "";
				this.filter("");
			} else if (event.key === "Enter") {
				this.openFirst();
			}
		});
		this.box = box;
		this.input = input;
		this.empty = empty;
	}

	filter(query) {
		const items = this.itemsRoot();
		if (!items) return 0;
		const visible = applyFilter(items, query);
		if (this.empty) this.empty.hidden = visible > 0 || !normalise(query);
		return visible;
	}

	clear() {
		if (this.input) this.input.value = "";
		this.filter("");
	}

	openFirst() {
		const items = this.itemsRoot();
		if (!items) return;
		const anchors = items.querySelectorAll(`${ITEM}:not(.ui-nav-hidden) a.item-anchor[href]`);
		const target = [...anchors].find((a) => !a.closest(".ui-nav-hidden"));
		if (target) target.click();
	}

	/** Show the full label of a truncated sidebar item on hover. */
	titleOnOverflow(event) {
		const target = event.target;
		if (!target || !target.closest) return;
		const label = target.closest(".body-sidebar .sidebar-item-label");
		if (!label || label.hasAttribute("title")) return;
		if (label.scrollWidth > label.clientWidth) {
			label.setAttribute("title", label.textContent.trim());
		}
	}
}
