// Shared pieces of the experience home designs. Everything shown comes from
// Frappe: Number Cards (read and computed exactly like Frappe's workspace
// widget does), Dashboard Charts through erpnext_ui.api.home.get_chart (which
// checks the chart's permission), and permission-filtered lists from
// erpnext_ui.api.home.get_home. Nothing is invented; a source the user cannot
// read is left out.

export const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

export function icon(name, size = "sm") {
	try {
		return frappe.utils.icon(name || "folder-normal", size);
	} catch (e) {
		return "";
	}
}

export function formLink(doctype, name) {
	return frappe.utils.get_form_link(doctype, name);
}

export function listRoute(doctype) {
	return frappe.utils.generate_route({ type: "doctype", name: doctype });
}

export function workspaceRoute(page) {
	if (page && page._href) return page._href;
	const slug = frappe.router.slug(page.name || page.title);
	return page.public === 0 ? `/desk/private/${slug}` : `/desk/${slug}`;
}

export function reportRoute(name) {
	return frappe.utils.generate_route({ type: "report", name, is_query_report: 1 });
}

export function openList(doctype, filters) {
	frappe.route_options = filters || {};
	frappe.set_route("List", doctype);
}

export function greeting(name) {
	const h = new Date().getHours();
	const part = h < 12 ? __("Good morning") : h < 17 ? __("Good afternoon") : __("Good evening");
	return name ? `${part}, ${name}` : part;
}

export function longDate(dateStr) {
	try {
		const d = frappe.datetime.str_to_obj(dateStr);
		return d.toLocaleDateString(frappe.boot.lang || undefined, { weekday: "long", day: "numeric", month: "long" });
	} catch (e) {
		return frappe.datetime.str_to_user(dateStr);
	}
}

export function ago(datetime) {
	try {
		return frappe.datetime.prettyDate(datetime, true);
	} catch (e) {
		return "";
	}
}

/** Frappe's own status colour for a document status, as an indicator pill. */
export function statusPill(status) {
	if (!status) return "";
	const map = {
		Draft: "gray", Submitted: "blue", Cancelled: "red", Paid: "green", Unpaid: "orange", Overdue: "red",
		"Partly Paid": "yellow", Completed: "green", Open: "orange", Closed: "gray", "To Bill": "orange",
		"To Deliver": "orange", "To Deliver and Bill": "orange", "To Receive and Bill": "orange", Return: "gray",
	};
	return `<span class="indicator-pill ${map[status] || "gray"} filterable no-indicator-dot ellipsis">${esc(__(status))}</span>`;
}

export function empty(text, action = "") {
	return `<div class="eui-home-empty">${esc(text)}${action}</div>`;
}

export function section(title, body, { cls = "", extra = "" } = {}) {
	return `<section class="eui-home-card ${cls}"><header><h3>${esc(title)}</h3>${extra}</header><div class="eui-home-card-body">${body}</div></section>`;
}

export function createButtons(list, { primary = "Sales Invoice", max = 4 } = {}) {
	return (list || [])
		.slice(0, max)
		.map(
			(c) =>
				`<button type="button" class="btn btn-sm ${c.doctype === primary ? "btn-primary" : "btn-default"}" data-eui-new="${esc(
					c.doctype
				)}">${icon("add", "xs")} ${esc(__(c.label))}</button>`
		)
		.join("");
}

/** One delegated click handler per home container. */
export function bindActions(root) {
	if (root.__euiBound) return;
	root.__euiBound = true;
	root.addEventListener("click", (e) => {
		const el = e.target.closest("[data-eui-new],[data-eui-list],[data-eui-search]");
		if (!el) return;
		e.preventDefault();
		if (el.hasAttribute("data-eui-new")) frappe.new_doc(el.getAttribute("data-eui-new"));
		else if (el.hasAttribute("data-eui-search")) openSearch();
		else {
			let filters = {};
			try {
				filters = JSON.parse(el.getAttribute("data-eui-filters") || "{}");
			} catch (err) {
				filters = {};
			}
			openList(el.getAttribute("data-eui-list"), filters);
		}
	});
}

/** Frappe's own search dialog (the same call Frappe's workspace uses). */
export function openSearch() {
	const trigger = document.getElementById("navbar-modal-search");
	if (trigger) trigger.click();
	else frappe.set_route("List", "DocType");
}

/* ---------------- Number Cards ---------------- */

async function cardValue(doc) {
	const name = doc.name;
	await frappe.model.with_doctype(doc.document_type);
	const filters = frappe.dashboard_utils.get_all_filters(doc);
	const result = await frappe.xcall("frappe.desk.doctype.number_card.number_card.get_result", { doc, filters });
	let change = null;
	if (doc.show_percentage_stats) {
		try {
			change = await frappe.xcall("frappe.desk.doctype.number_card.number_card.get_percentage_difference", {
				doc,
				filters,
				result,
			});
		} catch (e) {
			change = null;
		}
	}
	const df = doc.function === "Count" ? null : frappe.meta.get_docfield(doc.document_type, doc.aggregate_function_based_on);
	return { name, label: doc.label || name, value: result, change, interval: doc.stats_time_interval, df, doctype: doc.document_type, filters };
}

export function formatCardValue(card) {
	const currency = card.df && card.df.fieldtype === "Currency";
	if (!card.value) return currency ? format_currency(0, frappe.defaults.get_default("currency"), 0) : "0";
	const country = frappe.sys_defaults && frappe.sys_defaults.country;
	const short = frappe.utils.shorten_number(card.value, country, 5);
	const [num, symbol] = String(short).split(" ");
	if (card.df && ["Currency", "Float"].includes(card.df.fieldtype)) {
		const formatted = card.df.fieldtype === "Currency" ? format_currency(parseFloat(num), frappe.defaults.get_default("currency"), 0) : num;
		return `${formatted}${symbol ? " " + symbol : ""}`;
	}
	return `${num}${symbol ? " " + symbol : ""}`;
}

/**
 * Render the pack's Number Cards into `el`. Cards the user cannot read, or
 * that fail, are left out. Returns the number shown.
 */
export async function renderCards(el, names, { big = false } = {}) {
	if (!el) return 0;
	if (!names || !names.length) {
		el.remove();
		return 0;
	}
	el.innerHTML = names.map(() => `<div class="eui-kpi is-loading"><span></span><b></b></div>`).join("");
	let docs = [];
	try {
		docs = await frappe.xcall("erpnext_ui.api.home.get_cards", { names: JSON.stringify(names) }, "GET");
	} catch (e) {
		docs = [];
	}
	const results = await Promise.all((docs || []).map((d) => cardValue(d).catch(() => null)));
	const cards = results.filter(Boolean);
	if (!cards.length) {
		el.outerHTML = empty(__("No figures to show: none of this experience's number cards are available to you."));
		return 0;
	}
	el.innerHTML = cards
		.map((c) => {
			const ch = c.change;
			const delta =
				ch === null || ch === undefined
					? ""
					: `<span class="eui-kpi-delta ${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "+" : ""}${esc(frappe.utils.shorten_number(ch))}% <em>${esc(
							__("since last {0}", [__(String(c.interval || "").replace(/ly$/, "").toLowerCase() || "period")])
					  )}</em></span>`;
			return `<a class="eui-kpi${big ? " is-big" : ""}" href="${esc(listRoute(c.doctype))}" data-eui-list="${esc(c.doctype)}" data-eui-filters="${esc(
				JSON.stringify(routeOptions(c.filters))
			)}"><span>${esc(__(c.label))}</span><b>${esc(formatCardValue(c))}</b>${delta}<small>${esc(__("Number Card"))}</small></a>`;
		})
		.join("");
	return cards.length;
}

/** Card filters ([[doctype, field, op, value], ...] or {field: value}) as list route options. */
export function routeOptions(filters) {
	const out = {};
	if (Array.isArray(filters)) {
		for (const f of filters) {
			if (Array.isArray(f) && f.length >= 4 && typeof f[1] === "string") out[f[1]] = f[2] === "=" ? f[3] : [f[2], f[3]];
		}
	} else if (filters && typeof filters === "object") Object.assign(out, filters);
	return out;
}

/* ---------------- Dashboard Charts ---------------- */

export async function renderChart(el, names, { title } = {}) {
	if (!el) return false;
	for (const name of names || []) {
		let chart = null;
		try {
			chart = await frappe.xcall("erpnext_ui.api.home.get_chart", { chart_name: name }, "GET");
		} catch (e) {
			chart = null;
		}
		if (!chart || !chart.data || !chart.data.labels || !chart.data.labels.length) continue;
		el.innerHTML = section(title || chart.label, `<div class="eui-home-chart"></div>`, {
			extra: `<span class="eui-home-meta">${esc(__(chart.timespan || ""))} · ${esc(__(chart.interval || ""))}</span>`,
		});
		const target = el.querySelector(".eui-home-chart");
		const css = getComputedStyle(document.documentElement);
		const primary = (css.getPropertyValue("--ui-primary") || "").trim() || chart.color || "#2490ef";
		new frappe.Chart(target, {
			data: chart.data,
			type: chart.type === "bar" ? "bar" : "line",
			height: 220,
			colors: [chart.color || primary],
			axisOptions: { xIsSeries: 1, shortenYAxisNumbers: 1, xAxisMode: "tick" },
			lineOptions: { regionFill: 1, hideDots: 1 },
			tooltipOptions: { formatTooltipY: (d) => format_currency(d, chart.currency) },
		});
		return true;
	}
	el.innerHTML = section(title || __("Trend"), empty(__("No chart to show: this experience's charts are not available to you.")));
	return false;
}

/* ---------------- lists ---------------- */

export function docRows(rows, { showStatus = true } = {}) {
	if (!rows || !rows.length) return "";
	return `<ul class="eui-home-list">${rows
		.map(
			(r) => `<li><a href="${esc(formLink(r.doctype, r.name))}">
				<span class="eui-home-list-main"><b>${esc(r.title || r.name)}</b><small>${esc(__(r.doctype))} · ${esc(r.name)}</small></span>
				${showStatus ? statusPill(r.status) : ""}<small class="eui-home-when">${esc(ago(r.modified || r.since))}</small></a></li>`
		)
		.join("")}</ul>`;
}

export function todoRows(rows) {
	if (!rows || !rows.length) return "";
	return `<ul class="eui-home-list">${rows
		.map((r) => {
			const href = r.reference_type && r.reference_name ? formLink(r.reference_type, r.reference_name) : formLink("ToDo", r.name);
			return `<li><a href="${esc(href)}"><span class="eui-home-list-main"><b>${esc(r.description || __("Task"))}</b><small>${esc(
				r.reference_type ? `${__(r.reference_type)} · ${r.reference_name}` : __("ToDo")
			)}</small></span>${r.date ? `<small class="eui-home-when">${esc(frappe.datetime.str_to_user(r.date))}</small>` : ""}</a></li>`;
		})
		.join("")}</ul>`;
}

export function approvalRows(rows) {
	if (!rows || !rows.length) return "";
	return `<ul class="eui-home-list">${rows
		.map(
			(r) => `<li><a href="${esc(formLink(r.doctype, r.name))}"><span class="eui-home-list-main"><b>${esc(__(r.doctype))}</b><small>${esc(
				r.name
			)}</small></span><span class="indicator-pill orange no-indicator-dot">${esc(__(r.state || "Open"))}</span><small class="eui-home-when">${esc(
				ago(r.since)
			)}</small></a></li>`
		)
		.join("")}</ul>`;
}

/**
 * The areas a user can open from a home. v16 boots the workspace list
 * (frappe.boot.workspaces); v17 replaced it with module sidebars, each
 * opened at its own landing route.
 */
export function navigableWorkspaces() {
	const legacy = frappe.boot.workspaces && frappe.boot.workspaces.pages;
	if (Array.isArray(legacy)) return legacy.filter((p) => p && !p.parent_page && p.is_hidden !== 1);
	const shells = frappe.boot.module_sidebars || {};
	const sidebar = frappe.app && frappe.app.sidebar;
	return Object.entries(shells)
		.map(([key, s]) => {
			let href = null;
			try {
				href = sidebar && typeof sidebar.module_landing_route === "function" ? sidebar.module_landing_route(key) : null;
			} catch (e) {
				href = null;
			}
			let iconName = s && s.header_icon;
			if (!iconName && typeof frappe.get_module_icon === "function") {
				try {
					iconName = frappe.get_module_icon(key);
				} catch (e) {
					iconName = null;
				}
			}
			return { name: key, title: (s && s.label) || key, icon: iconName || "folder-normal", public: 1, _href: href };
		})
		.filter((p) => p._href && p._href.startsWith("/desk/"));
}
