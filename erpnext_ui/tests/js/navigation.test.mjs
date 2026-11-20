// Phase 2: the sidebar navigation filter and its adapter wiring.

import { test } from "node:test";
import assert from "node:assert/strict";

import { applyFilter, normalise, FILTER_THRESHOLD } from "../../public/js/adapters/v16/navigation.js";
import { v16Adapter } from "../../public/js/adapters/v16.js";

// ------------------------------------------------------------ adapter wiring

test("v16 adapter skips the navigation helper when there is no document", () => {
	const engine = { logger: { error() {} } };
	assert.equal(v16Adapter.installNavigation(engine, { win: {} }), null);
});

// ------------------------------------------------------------ sidebar filter

// A tiny element tree with the two selector forms navigation.js uses:
// ":scope > .class" (direct children) and ".class" (descendants).
class Node {
	constructor(cls, text = "") {
		this.classes = new Set(cls.split(" ").filter(Boolean));
		this.ownText = text;
		this.children = [];
		this.classList = {
			contains: (c) => this.classes.has(c),
			toggle: (c, force) => (force ? this.classes.add(c) : this.classes.delete(c)),
		};
	}
	add(...kids) {
		this.children.push(...kids);
		return this;
	}
	get textContent() {
		return this.ownText + this.children.map((c) => c.textContent).join("");
	}
	descendants() {
		return this.children.flatMap((c) => [c, ...c.descendants()]);
	}
	querySelectorAll(selector) {
		const direct = selector.startsWith(":scope > ");
		const cls = selector.replace(":scope > ", "").replace(/^\./, "");
		return (direct ? this.children : this.descendants()).filter((n) => n.classes.has(cls));
	}
	querySelector(selector) {
		return this.querySelectorAll(selector)[0] || null;
	}
}

function item(label, children = []) {
	const node = new Node("sidebar-item-container").add(
		new Node("standard-sidebar-item").add(new Node("sidebar-item-label", label))
	);
	if (children.length) node.add(new Node("nested-container hidden").add(...children));
	return node;
}

function sidebar() {
	const reports = item("Reports", [item("Sales Analytics"), item("Sales Register")]);
	const setup = item("Setup", [item("Customer Group"), item("Territory")]);
	const root = new Node("sidebar-items").add(item("Home"), item("Sales Invoice"), reports, setup);
	return { root, reports, setup };
}

const hidden = (n) => n.classes.has("ui-nav-hidden");
const revealed = (n) => n.querySelector(":scope > .nested-container").classes.has("ui-nav-reveal");

test("normalise lower-cases and collapses whitespace", () => {
	assert.equal(normalise("  Sales   INVOICE "), "sales invoice");
	assert.equal(normalise(null), "");
});

test("an empty query shows everything and reveals nothing", () => {
	const { root, reports } = sidebar();
	assert.equal(applyFilter(root, ""), 4);
	assert.ok(root.descendants().every((n) => !hidden(n)));
	assert.equal(revealed(reports), false);
});

test("a child match keeps its section and opens it without touching .hidden", () => {
	const { root, reports, setup } = sidebar();
	assert.equal(applyFilter(root, "analy"), 1);
	assert.equal(hidden(reports), false);
	assert.equal(revealed(reports), true);
	assert.ok(reports.querySelector(":scope > .nested-container").classes.has("hidden"));
	const [analytics, register] = reports.querySelector(":scope > .nested-container").children;
	assert.equal(hidden(analytics), false);
	assert.equal(hidden(register), true);
	assert.equal(hidden(setup), true);
});

test("a section match shows all of its children and keeps it collapsed", () => {
	const { root, setup } = sidebar();
	applyFilter(root, "setup");
	assert.equal(hidden(setup), false);
	assert.equal(revealed(setup), false);
	for (const child of setup.querySelector(":scope > .nested-container").children) {
		assert.equal(hidden(child), false);
	}
});

test("a section match resets children hidden by an earlier query", () => {
	const { root, reports } = sidebar();
	applyFilter(root, "register");
	applyFilter(root, "reports");
	for (const child of reports.querySelector(":scope > .nested-container").children) {
		assert.equal(hidden(child), false);
	}
});

test("no match hides every item; clearing restores them", () => {
	const { root } = sidebar();
	assert.equal(applyFilter(root, "zzz"), 0);
	assert.ok(root.children.every(hidden));
	assert.equal(applyFilter(root, ""), 4);
	assert.ok(root.descendants().every((n) => !hidden(n)));
});

test("the filter box threshold is a small, sensible number", () => {
	assert.ok(FILTER_THRESHOLD >= 6 && FILTER_THRESHOLD <= 20);
});
