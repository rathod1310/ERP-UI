// Theme gallery and segmented controls shared by the "Appearance & Theme" page
// and UI Experience Settings. Renders plain DOM; one delegated click listener
// per container, so re-rendering never stacks handlers.

import { isSafeValue } from "../theme/tokens.js";

const SAMPLE_VARS = {
	"--s-background": "background",
	"--s-sidebar": "sidebar-bg",
	"--s-sidebar-text": "sidebar-text",
	"--s-sidebar-active": "sidebar-active-bg",
	"--s-surface": "surface",
	"--s-border": "border",
	"--s-text": "text",
	"--s-muted": "text-muted",
	"--s-primary": "primary",
};
const SWATCHES = ["primary", "secondary", "background", "surface", "text", "border"];

export function escapeHtml(value) {
	return String(value ?? "").replace(
		/[&<>"']/g,
		(ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
	);
}

const t = (text) => (typeof window !== "undefined" && window.__ ? window.__(text) : text);

function sampleStyle(tokens) {
	return Object.entries(SAMPLE_VARS)
		.filter(([, token]) => isSafeValue(tokens[token]))
		.map(([cssVar, token]) => `${cssVar}: ${tokens[token]}`)
		.join("; ");
}

export function themeCardHtml(theme, { selected = false, disabled = false, badges = [] } = {}) {
	const tokens = theme.tokens || {};
	const swatches = SWATCHES.filter((k) => isSafeValue(tokens[k]))
		.map(
			(k) =>
				`<span class="eui-swatch" style="background: ${tokens[k]}" title="${escapeHtml(
					k
				)}"></span>`
		)
		.join("");
	const badgeHtml = badges
		.map(
			(b) =>
				`<span class="eui-badge${b.current ? " is-current" : ""}">${escapeHtml(
					b.label
				)}</span>`
		)
		.join("");
	return `<button type="button" class="eui-theme-card" data-theme-name="${escapeHtml(
		theme.name
	)}"
		aria-pressed="${selected ? "true" : "false"}" ${disabled ? "disabled" : ""}>
		<span class="eui-theme-sample" style="${sampleStyle(tokens)}" aria-hidden="true">
			<span class="eui-theme-sample-sidebar"><span></span><span></span><span></span><span></span></span>
			<span class="eui-theme-sample-main"><span class="eui-theme-sample-card">
				<span class="eui-theme-sample-line"></span><span class="eui-theme-sample-line short"></span>
				<span class="eui-theme-sample-button"></span>
			</span></span>
		</span>
		<span class="eui-theme-body">
			<span class="eui-theme-name"><span>${escapeHtml(
				t(theme.name)
			)}</span><span class="eui-badges">${badgeHtml}</span></span>
			<span class="eui-theme-desc">${escapeHtml(t(theme.description || ""))}</span>
			<span class="eui-swatches">${swatches}</span>
		</span>
	</button>`;
}

function delegate(container, selector, attr, handler) {
	container.__euiHandler = handler;
	if (container.__euiBound) return;
	container.__euiBound = true;
	container.addEventListener("click", (event) => {
		const target = event.target.closest(selector);
		if (!target || target.disabled || !container.contains(target)) return;
		container.__euiHandler && container.__euiHandler(target.getAttribute(attr));
	});
}

/**
 * Render theme cards into `container` (an Element).
 * options: selected (name), disabled, badgesFor(theme) -> [{label, current}], onSelect(name)
 */
export function renderGallery(container, themes, options = {}) {
	container.classList.add("eui-gallery");
	container.setAttribute("role", "group");
	container.innerHTML = themes
		.map((theme) =>
			themeCardHtml(theme, {
				selected: theme.name === options.selected,
				disabled: options.disabled,
				badges: options.badgesFor ? options.badgesFor(theme) : [],
			})
		)
		.join("");
	if (options.onSelect)
		delegate(container, ".eui-theme-card", "data-theme-name", options.onSelect);
}

/** options: [{value, label}], selected, disabled, onSelect(value), label (aria) */
export function renderSegmented(container, items, options = {}) {
	container.classList.add("eui-segmented");
	container.setAttribute("role", "group");
	if (options.label) container.setAttribute("aria-label", options.label);
	container.innerHTML = items
		.map(
			(item) =>
				`<button type="button" data-value="${escapeHtml(item.value)}"
				aria-pressed="${item.value === options.selected ? "true" : "false"}"
				${options.disabled ? "disabled" : ""}>${escapeHtml(item.label)}</button>`
		)
		.join("");
	if (options.onSelect)
		delegate(container, "button[data-value]", "data-value", options.onSelect);
}

/**
 * Option cards: a labelled choice with a one-line explanation.
 * items: [{value, label, description, badges: [{label, current}]}]
 * options: selected, disabled, onSelect(value), label (aria)
 */
export function renderOptions(container, items, options = {}) {
	container.classList.add("eui-options");
	container.setAttribute("role", "group");
	if (options.label) container.setAttribute("aria-label", options.label);
	container.innerHTML = items
		.map(
			(item) => `<button type="button" class="eui-option" data-value="${escapeHtml(item.value)}"
				aria-pressed="${item.value === options.selected ? "true" : "false"}"
				${options.disabled ? "disabled" : ""}>
				<span class="eui-option-title"><span>${escapeHtml(item.label)}</span>${badgesHtml(
				item.badges
			)}</span>
				<span class="eui-option-desc">${escapeHtml(item.description || "")}</span>
			</button>`
		)
		.join("");
	if (options.onSelect) delegate(container, ".eui-option", "data-value", options.onSelect);
}

function badgesHtml(badges = []) {
	if (!badges.length) return "";
	return `<span class="eui-badges">${badges
		.map(
			(b) =>
				`<span class="eui-badge${b.current ? " is-current" : ""}">${escapeHtml(b.label)}</span>`
		)
		.join("")}</span>`;
}

/** A wireframe of a layout, drawn with the current theme's colours. */
export function layoutSampleHtml(attributes = {}) {
	const attr = (name, value) =>
		/^[a-z-]{1,30}$/.test(value || "") ? ` data-${name}="${value}"` : "";
	const rows = '<span class="eui-ls-row"></span>'.repeat(5);
	return `<span class="eui-layout-sample"${attr("nav", attributes.navigation)}${attr(
		"cards",
		attributes.card_style
	)}${attr("canvas", attributes.page_background)}${attr("list", attributes.list_format)}${attr(
		"width",
		attributes.content_width
	)}${attr("workspace", attributes.workspace_format)} aria-hidden="true">
		<span class="eui-ls-sidebar"><span></span><span></span><span></span><span></span></span>
		<span class="eui-ls-main">
			<span class="eui-ls-head"></span>
			<span class="eui-ls-card">${rows}</span>
		</span>
	</span>`;
}

/**
 * Layout preset cards. presets: [{name, description, attributes, badges}]
 * options: selected (name or null for "Custom"), disabled, onSelect(name)
 */
export function renderLayoutPresets(container, presets, options = {}) {
	container.classList.add("eui-gallery", "eui-layout-gallery");
	container.setAttribute("role", "group");
	container.innerHTML = presets
		.map(
			(p) => `<button type="button" class="eui-theme-card eui-layout-card" data-preset="${escapeHtml(
				p.name
			)}" aria-pressed="${p.name === options.selected ? "true" : "false"}" ${
				options.disabled ? "disabled" : ""
			}>
				${layoutSampleHtml(p.attributes)}
				<span class="eui-theme-body">
					<span class="eui-theme-name"><span>${escapeHtml(t(p.name))}</span>${badgesHtml(
				p.badges
			)}</span>
					<span class="eui-theme-desc">${escapeHtml(t(p.description || ""))}</span>
				</span>
			</button>`
		)
		.join("");
	if (options.onSelect) delegate(container, ".eui-layout-card", "data-preset", options.onSelect);
}
