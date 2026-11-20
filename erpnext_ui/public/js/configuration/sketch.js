// Structural previews of an Experience Pack for the Appearance page: a small
// drawing of the Desk with the pack's navigation, header and the chosen page
// (home, form, list or report), coloured with the pack's real theme tokens.
// The drawing follows the pack's component variants, so a custom pack made of
// existing variants is previewed correctly without any new code.
//
// Output is plain HTML at a fixed 640 x 400 canvas; the page scales it to the
// card width (see scaleSketches). Only theme token values that pass
// isSafeValue reach a style attribute.

import { isSafeValue } from "../theme/tokens.js";
import { escapeHtml } from "./gallery.js";

export const SKETCH_WIDTH = 640;
export const SKETCH_HEIGHT = 400;

const VARS = {
	"--sk-bg": "background",
	"--sk-surface": "surface",
	"--sk-muted-bg": "surface-muted",
	"--sk-side": "sidebar-bg",
	"--sk-side-fg": "sidebar-text",
	"--sk-active": "sidebar-active-bg",
	"--sk-active-fg": "sidebar-active-text",
	"--sk-primary": "primary",
	"--sk-primary-fg": "primary-contrast",
	"--sk-secondary": "secondary",
	"--sk-text": "text",
	"--sk-muted": "text-muted",
	"--sk-border": "border",
	"--sk-radius": "radius",
	"--sk-ok": "success",
	"--sk-warn": "warning",
	"--sk-bad": "danger",
};

function styleFor(tokens) {
	return Object.entries(VARS)
		.filter(([, token]) => isSafeValue(tokens && tokens[token]))
		.map(([v, token]) => `${v}:${tokens[token]}`)
		.join(";");
}

const t = (text) => (typeof window !== "undefined" && window.__ ? window.__(text) : text);
const bar = (w, cls = "") => `<i class="sk-bar ${cls}" style="width:${w}"></i>`;
const lines = (n, w = ["80%", "62%", "70%", "54%", "66%"]) =>
	Array.from({ length: n }, (_, i) => bar(w[i % w.length])).join("");
const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join("");
const TILE_COLOURS = ["#2d6a87", "#3b6e4f", "#8a5a1f", "#6b4f9e", "#9b3d5c", "#1f7a7a", "#55606e", "#a0522d"];

/* ---------- navigation ---------- */
function nav(shell, view) {
	const items = (n, active = 1) =>
		repeat(n, (i) => `<span class="sk-item${i === active ? " on" : ""}"><b></b>${bar(`${45 + ((i * 13) % 30)}%`)}</span>`);
	switch (shell.nav) {
		case "floating":
			return `<aside class="sk-side sk-floating"><span class="sk-brand"><b></b>${bar("50%")}</span><span class="sk-pill-search"></span>${items(8)}</aside>`;
		case "app-rail":
			if (view === "home") return "";
			return `<aside class="sk-rail sk-dark">${repeat(7, (i) => `<b class="${i === 2 ? "on" : ""}"></b>`)}</aside><aside class="sk-side sk-light">${items(6, 2)}</aside>`;
		case "executive":
			return `<aside class="sk-side sk-exec"><span class="sk-brand"><b class="gold"></b>${bar("50%")}</span>${items(1, 0)}<span class="sk-sec"></span>${items(5, -1)}<span class="sk-sec"></span>${items(2, -1)}</aside>`;
		case "department":
			return `<aside class="sk-side"><span class="sk-switch"><b></b>${bar("40%")}</span><span class="sk-sec"></span>${items(3, 0)}<span class="sk-sec"></span>${items(4, -1)}</aside>`;
		case "signature":
			return `<aside class="sk-side sk-sig"><span class="sk-brand"><b class="sig"></b>${bar("52%")}</span><span class="sk-pill-search dark"></span><span class="sk-sec"></span>${items(4, 0)}<span class="sk-sec"></span>${items(4, -1)}</aside>`;
		case "icon-rail":
			return `<aside class="sk-rail">${repeat(7, (i) => `<b class="${i === 0 ? "on" : ""}"></b>`)}</aside>`;
		default:
			return `<aside class="sk-side"><span class="sk-sec"></span>${items(4, 0)}<span class="sk-sec"></span>${items(3, -1)}<span class="sk-sec"></span>${items(2, -1)}</aside>`;
	}
}

/* ---------- header ---------- */
function header(shell, title) {
	switch (shell.header) {
		case "classic":
			return `<header class="sk-top sk-top-classic"><b class="sk-mark"></b>${bar("70px", "light")}<span class="sk-search dark"></span><span class="sp"></span><b class="sk-dot"></b><b class="sk-av"></b></header>`;
		case "search":
			return `<header class="sk-top"><b class="sk-grid"></b>${bar("60px")}<span class="sp"></span><span class="sk-search wide"></span><span class="sp"></span><b class="sk-av"></b></header>`;
		case "management":
			return `<header class="sk-top">${bar("80px")}<span class="sp"></span><span class="sk-select"></span><span class="sk-select"></span><b class="sk-dot"></b></header>`;
		case "department-tabs":
			return `<header class="sk-top sk-tabs">${repeat(7, (i) => `<span class="${i === 0 ? "on" : ""}">${bar(`${30 + ((i * 7) % 20)}px`)}</span>`)}<span class="sp"></span><b class="sk-av"></b></header>`;
		case "brand":
			return `<header class="sk-top sk-top-brand">${bar("16%", "title")}<span class="sp"></span><span class="sk-search pill"></span><b class="sk-dot"></b><b class="sk-av"></b></header>`;
		case "command":
			return `<div class="sk-headless"><span class="sk-title big">${escapeHtml(title)}</span><span class="sp"></span><span class="sk-search pill"></span></div>`;
		default:
			return "";
	}
}

/* ---------- home ---------- */
const kpis = (n, cls = "") =>
	`<div class="sk-row">${repeat(n, () => `<span class="sk-card sk-kpi ${cls}">${bar("55%")}<em></em>${bar("35%", "accent")}</span>`)}</div>`;
const chart = (kind = "area") =>
	kind === "bars"
		? `<span class="sk-card sk-chart bars">${repeat(6, (i) => `<b style="height:${35 + ((i * 17) % 50)}%"></b><b class="b2" style="height:${20 + ((i * 11) % 35)}%"></b>`)}</span>`
		: `<span class="sk-card sk-chart"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><polygon points="0,40 0,28 12,25 24,27 36,20 48,22 60,14 72,16 84,9 100,5 100,40" /><polyline points="0,28 12,25 24,27 36,20 48,22 60,14 72,16 84,9 100,5" /></svg></span>`;
const listCard = (rows, pills = false) =>
	`<span class="sk-card sk-list">${bar("45%", "head")}${repeat(rows, (i) => `<span class="sk-line">${bar(`${50 + ((i * 9) % 30)}%`)}${pills ? `<i class="sk-pill p${i % 3}"></i>` : ""}</span>`)}</span>`;

function home(shell) {
	switch (shell.home) {
		case "dashboard":
			return `<div class="sk-head">${bar("26%", "title")}<span class="sp"></span><i class="sk-btn"></i><i class="sk-btn pri"></i></div>${kpis(4)}<div class="sk-row grow">${chart()}${listCard(5, true)}</div>`;
		case "hub":
			return `<div class="sk-hero">${bar("36%", "title")}<span class="sk-search hero"></span><span class="sk-chips">${repeat(4, () => "<i></i>")}</span></div>
				<div class="sk-tiles">${repeat(8, (i) => `<span><b style="background:${TILE_COLOURS[i]}"></b>${bar("70%")}</span>`)}</div>
				<div class="sk-row">${repeat(4, (g) => `<span class="sk-card sk-cat">${bar("50%", "head")}<span class="sk-tiles small">${repeat(3, (i) => `<span><b style="background:${TILE_COLOURS[(g * 2 + i) % 8]}"></b></span>`)}</span></span>`)}</div>`;
		case "overview":
			return `<div class="sk-head">${bar("30%", "title serif")}</div>${kpis(5, "big")}<div class="sk-row grow">${chart("bars")}${listCard(4)}</div><div class="sk-row">${listCard(3)}${listCard(3)}</div>`;
		case "department":
			return `<div class="sk-head">${bar("24%", "title")}<span class="sp"></span>${repeat(3, () => '<i class="sk-btn"></i>')}<i class="sk-btn pri"></i></div>${kpis(4)}<div class="sk-row grow">${listCard(4)}${listCard(3)}${listCard(2)}</div>`;
		case "signature":
			return `<span class="sk-sig-hero">${bar("22%")}${bar("38%", "title")}<span class="sp"></span><span class="sk-sig-actions"><i class="sk-btn pri"></i><i class="sk-btn"></i></span></span>${kpis(4)}<div class="sk-row grow">${chart()}${listCard(4, true)}</div>`;
		case "minimal":
			return `<div class="sk-head">${bar("14%", "title")}</div><span class="sk-underline"></span><div class="sk-row grow"><span class="sk-plain">${repeat(6, () => `<span class="sk-line">${bar("60%")}</span>`)}</span><span class="sk-plain">${repeat(6, () => `<span class="sk-line">${bar("72%")}</span>`)}</span></div>`;
		default:
			return `<div class="sk-head">${bar("14%", "title")}</div><div class="sk-row">${repeat(4, () => `<span class="sk-card sk-short"><b></b>${bar("50%")}</span>`)}</div>
				<div class="sk-grid3">${repeat(6, () => `<span class="sk-card sk-links"><i class="sk-band"></i>${lines(4)}</span>`)}</div>`;
	}
}

/* ---------- form ---------- */
const fields = (n) => `<span class="sk-fields">${repeat(n, () => `<span class="sk-field">${bar("40%")}<i></i></span>`)}</span>`;
function form(shell) {
	const tabs = `<span class="sk-ftabs">${repeat(5, (i) => `<i class="${i === 0 ? "on" : ""}"></i>`)}</span>`;
	const body = `${tabs}<span class="sk-fsec">${bar("22%", "head")}${fields(3)}</span><span class="sk-fsec">${bar("14%", "head")}<span class="sk-grid">${repeat(3, () => "<i></i>")}</span></span><span class="sk-fsec">${fields(3)}</span>`;
	const head = `<div class="sk-head">${bar("24%", "title")}<i class="sk-pill p1"></i><span class="sp"></span><i class="sk-btn"></i><i class="sk-btn pri"></i></div>`;
	const side = `<span class="sk-fside"><span class="sk-card">${lines(4)}</span><span class="sk-card">${lines(2)}</span></span>`;
	switch (shell.form) {
		case "facts":
			return `<span class="sk-card sk-factcard"><span class="sk-head">${bar("30%", "title")}<i class="sk-pill p1"></i><span class="sp"></span><i class="sk-btn pri"></i></span><span class="sk-facts">${repeat(5, () => `<span>${bar("50%")}${bar("70%", "strong")}</span>`)}</span></span><div class="sk-row grow"><span class="sk-card sk-form soft">${body}</span>${side}</div>`;
		case "summary":
			return `${head}<div class="sk-row grow"><span class="sk-card sk-form">${body}</span><span class="sk-fside"><span class="sk-card sk-sum">${bar("40%")}<em></em>${lines(3)}</span><span class="sk-card">${lines(3)}</span></span></div>`;
		case "next-step":
			return `${head}<span class="sk-next"><b></b>${bar("30%")}<span class="sp"></span>${repeat(3, () => '<i class="sk-btn"></i>')}</span><div class="sk-row grow"><span class="sk-card sk-form">${body}</span>${side}</div>`;
		case "hairline":
			return `${head}<span class="sk-form hairline">${body}</span>`;
		case "elevated":
			return `${head}<div class="sk-row grow"><span class="sk-card sk-form soft elevated">${body}</span><span class="sk-fside"><span class="sk-card soft sk-sum">${bar("40%")}<em></em>${lines(2)}</span><span class="sk-card soft">${lines(3)}</span></span></div>`;
		case "bands":
			return `${head}<div class="sk-row grow"><span class="sk-card sk-form bands">${body}</span>${side}</div>`;
		default:
			return `${head}<div class="sk-row grow"><span class="sk-card sk-form">${body}</span>${side}</div>`;
	}
}

/* ---------- list ---------- */
function list(shell) {
	const head = `<div class="sk-head">${bar("20%", "title")}<span class="sp"></span><i class="sk-btn"></i><i class="sk-btn pri"></i></div>`;
	const rows = (n, check = true) =>
		`<span class="sk-table">${`<span class="sk-tr th">${check ? "<i class='cb'></i>" : ""}${bar("18%")}${bar("10%")}${bar("14%")}${bar("12%", "r")}</span>`}${repeat(n, (i) => `<span class="sk-tr">${check ? "<i class='cb'></i>" : ""}${bar(`${16 + ((i * 5) % 10)}%`, "strong")}<i class="sk-pill p${i % 3}"></i>${bar("14%")}${bar("12%", "r")}</span>`)}</span>`;
	switch (shell.list) {
		case "card-table":
			return `${head}<span class="sk-chips left">${repeat(3, () => "<i></i>")}</span><span class="sk-card soft">${rows(8)}</span>`;
		case "status-tabs":
			return `${head}<span class="sk-qtabs">${repeat(5, (i) => `<i class="${i === 2 ? "on" : ""}"></i>`)}</span><span class="sk-card">${rows(8)}</span>`;
		case "data-summary":
			return `${head}${kpis(4)}<span class="sk-card">${rows(6, false)}</span>`;
		case "my-work":
			return `${head}<span class="sk-qtabs">${repeat(3, (i) => `<i class="${i === 1 ? "on" : ""} wide"></i>`)}</span><span class="sk-card">${rows(7)}</span>`;
		case "hairline":
			return `${head}<span class="sk-plain">${rows(10, false)}</span>`;
		case "elevated":
			return `${head}<span class="sk-qtabs">${repeat(4, (i) => `<i class="${i === 0 ? "on" : ""}"></i>`)}</span><span class="sk-card soft sk-elevated">${rows(8)}</span>`;
		default:
			return `${head}<span class="sk-card"><span class="sk-filters">${repeat(4, () => "<i></i>")}</span>${rows(8)}</span>`;
	}
}

/* ---------- report ---------- */
function report(shell) {
	const head = `<div class="sk-head">${bar("22%", "title")}<span class="sp"></span><i class="sk-btn"></i><i class="sk-btn pri"></i></div>`;
	const filters = `<span class="sk-filters">${repeat(4, () => "<i></i>")}</span>`;
	const table = (n) =>
		`<span class="sk-table">${repeat(n, (i) => `<span class="sk-tr${i === 0 ? " th" : ""}">${bar("20%")}${bar("12%")}${bar("18%")}${bar("12%", "r")}${bar("12%", "r")}</span>`)}</span>`;
	if (shell.report === "analytic")
		return `${head}${filters}<div class="sk-row grow">${chart("bars")}<span class="sk-kpis2">${repeat(4, () => `<span class="sk-card sk-kpi">${bar("50%")}<em></em></span>`)}</span></div><span class="sk-card">${table(5)}</span>`;
	if (shell.report === "plain") return `${head}${filters}<span class="sk-plain">${table(11)}</span>`;
	return `${head}<span class="sk-card">${filters}</span><span class="sk-card">${table(9)}</span>`;
}

const VIEWS = { home, form, list, report };
const TITLES = { home: "Home", form: "Sales Invoice", list: "Sales Invoice", report: "Sales Register" };

/** HTML for one preview. `theme` is a catalog entry (tokens) for the pack's mode. */
export function sketchHtml(pack, view = "home", theme = null, { dark = false } = {}) {
	const shell = pack.shell || {};
	const v = VIEWS[view] ? view : "home";
	const title = t(TITLES[v]);
	const content = VIEWS[v](shell);
	const top = header(shell, title);
	const headless = shell.header === "command" || shell.header === "none";
	const fullTop = shell.header === "classic";
	const side = nav(shell, v);
	const main = `<div class="sk-main">${headless ? "" : ""}${content}</div>`;
	const label = `${pack.title}: ${t(TITLES[v])}`;
	const body = fullTop
		? `${top}<div class="sk-body">${side}${main}</div>`
		: `<div class="sk-body">${side}<div class="sk-col">${top}${main}</div></div>`;
	return `<div class="eui-sk${dark ? " is-dark" : ""}" role="img" aria-label="${escapeHtml(label)}" data-nav="${escapeHtml(
		shell.nav || ""
	)}" data-header="${escapeHtml(shell.header || "")}" data-home="${escapeHtml(shell.home || "")}" style="${styleFor(
		theme && theme.tokens
	)}"><div class="eui-sk-canvas">${body}</div></div>`;
}

/** Scale every sketch inside `root` to its box (call after rendering and on resize). */
export function scaleSketches(root) {
	if (!root || !root.querySelectorAll) return;
	root.querySelectorAll(".eui-sk").forEach((el) => {
		const w = el.clientWidth;
		if (w) el.style.setProperty("--sk-scale", (w / SKETCH_WIDTH).toFixed(4));
	});
}
