// The four experience home designs drawn by the ui-home page. Each one gets
// the page container, the pack (its shell variants and home content) and the
// data from erpnext_ui.api.home.get_home, and renders plain DOM.

import {
	approvalRows,
	bindActions,
	createButtons,
	docRows,
	empty,
	esc,
	greeting,
	icon,
	longDate,
	renderCards,
	renderChart,
	reportRoute,
	section,
	todoRows,
	workspaceRoute,
	formLink,
	ago,
	listRoute,
	navigableWorkspaces,
} from "./common.js";

/* ---------- Frappe's own Home workspace content (Classic, Minimal) ---------- */
function homeWorkspace() {
	const pages = workspaces();
	return pages.find((p) => p.name === "Home") || pages[0] || null;
}

async function workspaceContent(page) {
	if (!page) return null;
	try {
		return await frappe.xcall(
			"frappe.desk.desktop.get_desktop_page",
			{ page: { name: page.name, title: page.title, public: page.public } },
			"GET"
		);
	} catch (e) {
		return null;
	}
}

function itemRoute(type, name, isQuery) {
	if (!name) return "#";
	const t = String(type || "DocType").toLowerCase();
	if (t === "url") return name;
	if (t === "dashboard") return `/desk/dashboard-view/${encodeURIComponent(name)}`;
	return frappe.utils.generate_route({ type: t === "doctype" ? "doctype" : t, name, is_query_report: isQuery ? 1 : 0 });
}

const shortcutRoute = (s) => (s.type === "URL" ? s.url : itemRoute(s.type, s.link_to, s.type === "Report" && s.is_query_report !== 0));

/* ---------- Classic Business: structured workspace ---------- */
async function workspace(root, pack, data) {
	const page = homeWorkspace();
	root.innerHTML = `<div class="eui-home-hello"><div><small>${esc(longDate(data.today))}${data.company ? " · " + esc(data.company) : ""}</small><h2>${esc(
		__(page ? page.title || page.name : "Home")
	)}</h2></div><div class="eui-home-actions">${createButtons(data.create, { max: 3 })}</div></div><div class="eui-home-stack" data-ws>${empty(__("Loading…"))}</div>`;
	const content = await workspaceContent(page);
	const shortcuts = (content && content.shortcuts && content.shortcuts.items) || [];
	const cards = ((content && content.cards && content.cards.items) || []).filter((c) => (c.links || []).length);
	const groups = workspaceGroups();
	root.querySelector("[data-ws]").innerHTML = `
		${shortcuts.length ? `<h3 class="eui-home-label">${esc(__("Your Shortcuts"))}</h3><div class="eui-ws-shortcuts">${shortcuts
			.map((s) => `<a class="eui-ws-shortcut" href="${esc(shortcutRoute(s))}">${icon(s.icon || "file", "sm")}<span>${esc(__(s.label || s.link_to))}</span></a>`)
			.join("")}</div>` : ""}
		${cards.length ? `<h3 class="eui-home-label">${esc(__("Reports & Masters"))}</h3><div class="eui-ws-cards">${cards
			.map(
				(c) => `<section class="eui-ws-card"><h4>${esc(__(c.label))}</h4><ul>${c.links
					.map((l) => `<li><a href="${esc(itemRoute(l.link_type, l.link_to, l.is_query_report))}">${esc(__(l.label || l.link_to))}</a></li>`)
					.join("")}</ul></section>`
			)
			.join("")}</div>` : ""}
		<h3 class="eui-home-label">${esc(__("All Workspaces"))}</h3>
		<div class="eui-ws-index">${groups
			.map(([, label, pages]) => `<section><h4>${esc(label)}</h4><ul>${pages.map((p) => `<li><a href="${esc(workspaceRoute(p))}">${esc(__(p.title || p.name))}</a></li>`).join("")}</ul></section>`)
			.join("")}</div>`;
}

/* ---------- Minimal Professional: search, pinned, recent ---------- */
async function minimal(root, pack, data) {
	const page = homeWorkspace();
	root.innerHTML = `<div class="eui-min-head"><h2>${esc(__("Home"))}</h2><small>${esc(longDate(data.today))}</small></div>
		<button type="button" class="eui-min-search" data-eui-search>${icon("search", "sm")}<span>${esc(__("Search or jump to…"))}</span><kbd>Ctrl K</kbd></button>
		<div class="eui-min-cols"><section><h3>${esc(__("Pinned"))}</h3><ul class="eui-min-list" data-pinned><li class="eui-home-empty">${esc(
			__("Loading…")
		)}</li></ul></section>
		<section><h3>${esc(__("Recent"))}</h3>${
			data.recent && data.recent.length
				? `<ul class="eui-min-list">${data.recent
						.map(
							(r) => `<li><a href="${esc(formLink(r.doctype, r.name))}"><span>${esc(r.title || r.name)}</span><small>${esc(__(r.doctype))}</small><small>${esc(
								__(r.status || "")
							)}</small></a></li>`
						)
						.join("")}</ul>`
				: empty(__("Documents you change will appear here."))
		}</section></div>
		<nav class="eui-min-index" aria-label="${esc(__("Workspaces"))}">${workspaces()
			.map((p) => `<a href="${esc(workspaceRoute(p))}">${esc(__(p.title || p.name))}</a>`)
			.join("")}</nav>`;
	const content = await workspaceContent(page);
	const items = [
		...((content && content.shortcuts && content.shortcuts.items) || []).map((s) => [s.label || s.link_to, shortcutRoute(s), __(s.type || "")]),
		...(((content && content.cards && content.cards.items) || [])[0] || { links: [] }).links.map((l) => [l.label || l.link_to, itemRoute(l.link_type, l.link_to, l.is_query_report), __(l.link_type || "")]),
	].filter(([label], i, all) => all.findIndex(([other]) => other === label) === i).slice(0, 10);
	root.querySelector("[data-pinned]").innerHTML = items.length
		? items.map(([label, href, kind]) => `<li><a href="${esc(href)}"><span>${esc(__(label))}</span><small>${esc(kind)}</small></a></li>`).join("")
		: `<li class="eui-home-empty">${esc(__("Nothing pinned yet."))}</li>`;
}

/* ---------- Modern Business: modular dashboard ---------- */
function dashboard(root, pack, data) {
	root.innerHTML = `
		<div class="eui-home-hello">
			<div><small>${esc(longDate(data.today))}</small><h2>${esc(greeting(data.user.first_name))}</h2></div>
			<div class="eui-home-actions">${createButtons(data.create)}</div>
		</div>
		<div class="eui-kpis" data-cards></div>
		<div class="eui-home-grid two-one">
			<div data-chart></div>
			${section(__("Recently updated by you"), docRows(data.recent) || empty(__("Documents you change will appear here.")))}
		</div>
		${data.assigned && data.assigned.length ? section(__("Assigned to you"), todoRows(data.assigned)) : ""}`;
	renderCards(root.querySelector("[data-cards]"), pack.home.cards);
	renderChart(root.querySelector("[data-chart]"), pack.home.charts, { title: __("Sales trend") });
}

/* ---------- Application Hub: launcher ---------- */
const CATEGORIES = [
	["finance", __("Finance"), ["Invoicing", "Accounting", "Financial Reports", "Assets", "Payroll", "Tax & Benefits", "Expenses", "Banking"]],
	["sales", __("Sales and Customers"), ["Selling", "CRM", "Support", "Website"]],
	["supply", __("Supply Chain"), ["Buying", "Stock", "Manufacturing", "Subcontracting", "Quality"]],
	["people", __("People and Projects"), ["HR Setup", "Leaves", "Shift & Attendance", "Performance", "Recruitment", "Tenure", "Projects", "HR", "Employee Lifecycle"]],
	["admin", __("Administration"), ["ERPNext Settings", "Build", "Users", "Integrations", "Tools", "Welcome Workspace", "Home"]],
];
const RECENT_KEY = "erpnext_ui:hub-recent";

function workspaces() {
	return navigableWorkspaces();
}

function recentApps(all) {
	let names = [];
	try {
		names = JSON.parse(localStorage.getItem(`${RECENT_KEY}:${frappe.session.user}`) || "[]");
	} catch (e) {
		names = [];
	}
	return names.map((n) => all.find((p) => p.name === n)).filter(Boolean).slice(0, 8);
}

function rememberApp(name) {
	try {
		const key = `${RECENT_KEY}:${frappe.session.user}`;
		const names = JSON.parse(localStorage.getItem(key) || "[]").filter((n) => n !== name);
		names.unshift(name);
		localStorage.setItem(key, JSON.stringify(names.slice(0, 12)));
	} catch (e) {
		/* storage blocked: no recent list */
	}
}

function tile(page, cat) {
	return `<a class="eui-tile" data-cat="${esc(cat)}" data-eui-app="${esc(page.name)}" href="${esc(workspaceRoute(page))}">
		<span class="eui-tile-icon">${icon(page.icon || "folder-normal", "md")}</span>
		<span class="eui-tile-label">${esc(__(page.title || page.label || page.name))}</span></a>`;
}

function workspaceGroups() {
	const all = workspaces();
	const used = new Set();
	const groups = CATEGORIES.map(([key, label, names]) => {
		const pages = all.filter((p) => names.includes(p.name));
		pages.forEach((p) => used.add(p.name));
		return [key, label, pages];
	});
	const rest = all.filter((p) => !used.has(p.name));
	if (rest.length) groups.push(["more", __("More"), rest]);
	return groups.filter(([, , pages]) => pages.length);
}

function hub(root, pack, data) {
	const all = workspaces();
	const groups = workspaceGroups();
	const catOf = (name) => (groups.find(([, , pages]) => pages.some((p) => p.name === name)) || ["more"])[0];
	const recent = recentApps(all);
	root.innerHTML = `
		<div class="eui-hub-hero">
			<h2>${esc(__("What would you like to open?"))}</h2>
			<button type="button" class="eui-hub-search" data-eui-search>${icon("search", "sm")}<span>${esc(
				__("Search apps, documents and reports")
			)}</span><kbd>Ctrl K</kbd></button>
			${data.create && data.create.length ? `<div class="eui-hub-quick"><span>${esc(__("Quick actions"))}</span>${createButtons(data.create, { primary: null, max: 5 })}</div>` : ""}
		</div>
		${recent.length ? `<h3 class="eui-home-label">${esc(__("Recent apps"))}</h3><div class="eui-tiles">${recent.map((p) => tile(p, catOf(p.name))).join("")}</div>` : ""}
		<div class="eui-hub-groups">${groups
			.filter(([, , pages]) => pages.length)
			.map(
				([key, label, pages]) =>
					`<section class="eui-hub-group" data-cat="${esc(key)}"><h3>${esc(label)}</h3><div class="eui-tiles">${pages.map((p) => tile(p, key)).join("")}</div></section>`
			)
			.join("")}</div>
		${data.recent && data.recent.length ? section(__("Recently updated by you"), docRows(data.recent)) : ""}`;
	if (!all.length) root.querySelector(".eui-hub-groups").innerHTML = empty(__("No apps are available to you yet."));
	root.addEventListener("click", (e) => {
		const a = e.target.closest("[data-eui-app]");
		if (a) rememberApp(a.getAttribute("data-eui-app"));
	});
}

/* ---------- Executive Suite: overview ---------- */
function overview(root, pack, data) {
	const company = data.company ? esc(data.company) : "";
	root.innerHTML = `
		<div class="eui-home-hello is-exec">
			<div><small>${company}${company ? " · " : ""}${esc(longDate(data.today))}</small><h2>${esc(__("Executive Overview"))}</h2></div>
		</div>
		<div class="eui-kpis is-band" data-cards></div>
		<div class="eui-home-grid two-one">
			<div data-chart></div>
			${section(
				__("Waiting for your approval"),
				approvalRows(data.approvals) || empty(__("Nothing is waiting for your approval.")),
				{ extra: data.approvals && data.approvals.length ? `<span class="indicator-pill orange no-indicator-dot">${data.approvals.length}</span>` : "" }
			)}
		</div>
		<div class="eui-home-grid two">
			${section(
				__("Overdue receivables"),
				data.overdue && data.overdue.length
					? `<ul class="eui-home-list">${data.overdue
							.map(
								(r) => `<li><a href="${esc(formLink("Sales Invoice", r.name))}"><span class="eui-home-list-main"><b>${esc(r.customer)}</b><small>${esc(
									r.name
								)}</small></span><small class="eui-home-when">${esc(__("{0} days", [r.days]))}</small><b class="eui-num">${esc(
									format_currency(r.outstanding, r.currency)
								)}</b></a></li>`
							)
							.join("")}</ul>`
					: empty(__("No overdue sales invoices that you can see."))
			)}
			${section(
				__("Activity"),
				data.activity && data.activity.length
					? `<ul class="eui-home-list">${data.activity
							.map(
								(r) => `<li><a href="${esc(r.doctype && r.name ? formLink(r.doctype, r.name) : "#")}"><span class="eui-home-list-main"><b>${esc(
									r.subject
								)}</b></span><small class="eui-home-when">${esc(ago(r.when))}</small></a></li>`
							)
							.join("")}</ul>`
					: empty(__("Notifications for you will appear here."))
			)}
		</div>`;
	renderCards(root.querySelector("[data-cards]"), pack.home.cards, { big: true });
	renderChart(root.querySelector("[data-chart]"), pack.home.charts, { title: __("Sales and purchases") });
}

/* ---------- Department Workspace: department board ---------- */
const DEPT_KEY = "erpnext_ui:department";

export function savedDepartment() {
	try {
		return localStorage.getItem(`${DEPT_KEY}:${frappe.session.user}`) || null;
	} catch (e) {
		return null;
	}
}

function department(root, pack, data, { reload }) {
	const d = data.department;
	if (!d) {
		root.innerHTML = empty(__("No department is available to you yet. Ask your administrator for access to Sales, Purchase, Accounts, Stock or another area."));
		return;
	}
	const tabs = data.departments
		.map(
			(x) => `<button type="button" role="tab" aria-selected="${x.key === d.key}" data-eui-dept="${esc(x.key)}">${esc(x.label)}</button>`
		)
		.join("");
	const counts = d.counts
		.map(
			(c) => `<a class="eui-stage${c.count ? " has-work" : ""}" href="${esc(listRoute(c.doctype))}" data-eui-list="${esc(c.doctype)}" data-eui-filters="${esc(
				JSON.stringify(c.filters)
			)}"><b>${esc(c.count)}</b><span>${esc(c.label)}</span><small>${esc(__(c.doctype))}</small></a>`
		)
		.join("");
	const column = (title, body, count) =>
		`<section class="eui-board-col"><header><h3>${esc(title)}</h3><span class="eui-board-count">${count}</span></header>${body}</section>`;
	root.innerHTML = `
		<div class="eui-dept-band">
			<div class="eui-dept-tabs" role="tablist" aria-label="${esc(__("Departments"))}">${tabs}</div>
			<div class="eui-home-hello">
				<div><small>${esc(longDate(data.today))}</small><h2>${esc(__("{0} today", [d.label]))}</h2></div>
				<div class="eui-home-actions">${createButtons(d.create, { primary: d.create.length ? d.create[d.create.length > 2 ? 2 : 0].doctype : null })}</div>
			</div>
		</div>
		${counts ? `<div class="eui-pipeline" aria-label="${esc(__("Work waiting"))}">${counts}</div>` : ""}
		<div class="eui-board">
			${column(__("Assigned to me"), todoRows(d.assigned) || empty(__("Nothing is assigned to you.")), d.assigned.length)}
			${column(__("My drafts"), docRows(d.drafts.map((r) => ({ ...r, status: "Draft" }))) || empty(__("You have no drafts here.")), d.drafts.length)}
			${column(__("Waiting for my approval"), approvalRows(d.approvals) || empty(__("Nothing is waiting for you.")), d.approvals.length)}
		</div>
		${
			d.reports.length || d.workspace
				? `<div class="eui-home-links">${d.workspace ? `<a class="btn btn-default btn-sm" href="${esc(workspaceRoute({ name: d.workspace, public: 1 }))}">${esc(
						__("Open {0} workspace", [__(d.workspace)])
				  )}</a>` : ""}${d.reports
						.map((r) => `<a class="eui-home-link" href="${esc(reportRoute(r))}">${icon("table", "xs")} ${esc(__(r))}</a>`)
						.join("")}</div>`
				: ""
		}`;
	root.querySelectorAll("[data-eui-dept]").forEach((b) =>
		b.addEventListener("click", () => {
			const key = b.getAttribute("data-eui-dept");
			try {
				localStorage.setItem(`${DEPT_KEY}:${frappe.session.user}`, key);
			} catch (e) {
				/* storage blocked: the default department is used next time */
			}
			reload(key);
		})
	);
}

/* ---------- Signature Enterprise: branded command centre ---------- */
function signature(root, pack, data) {
	const brand = (frappe.boot.erpnext_ui && frappe.boot.erpnext_ui.brand) || {};
	const apps = workspaces();
	const attention = [...(data.approvals || []).map((r) => ["approval", r]), ...(data.assigned || []).map((r) => ["todo", r])];
	const meta = [esc(longDate(data.today)), data.company ? esc(data.company) : ""].filter(Boolean).join(" · ");
	root.innerHTML = `
		<section class="eui-sig-hero">
			<div class="eui-sig-hero-text">
				<small>${meta}</small>
				<h2>${esc(greeting(data.user.first_name))}</h2>
				<p>${esc(__("Here is where your business stands today."))}</p>
			</div>
			<div class="eui-sig-hero-side">
				<button type="button" class="eui-sig-search" data-eui-search>${icon("search", "sm")}<span>${esc(
					__("Search documents, reports and settings")
				)}</span><kbd>Ctrl K</kbd></button>
				<div class="eui-home-actions">${createButtons(data.create, { max: 4 })}</div>
			</div>
			${brand.mark ? `<img class="eui-sig-hero-mark" src="${esc(brand.mark)}" alt="" aria-hidden="true">` : ""}
		</section>
		<div class="eui-kpis eui-sig-kpis" data-cards></div>
		<div class="eui-home-grid two-one">
			<div data-chart></div>
			${section(
				__("Needs your attention"),
				attention.length
					? [approvalRows(data.approvals), todoRows(data.assigned)].filter(Boolean).join("")
					: empty(__("You are all caught up.")),
				{ cls: "eui-sig-attention", extra: attention.length ? `<span class="eui-sig-count">${attention.length}</span>` : "" }
			)}
		</div>
		${
			apps.length
				? `<section class="eui-home-card eui-sig-apps"><header><h3>${esc(__("Your workspaces"))}</h3><small>${esc(
						__("{0} areas", [apps.length])
				  )}</small></header><div class="eui-sig-app-grid">${apps
						.map(
							(p) => `<a class="eui-sig-app" href="${esc(workspaceRoute(p))}"><span class="eui-sig-app-icon">${icon(
								p.icon || "folder-normal",
								"md"
							)}</span><span>${esc(__(p.title || p.label || p.name))}</span></a>`
						)
						.join("")}</div></section>`
				: ""
		}
		${section(__("Recently updated by you"), docRows(data.recent) || empty(__("Documents you change will appear here.")))}`;
	renderCards(root.querySelector("[data-cards]"), pack.home.cards);
	renderChart(root.querySelector("[data-chart]"), pack.home.charts, { title: __("Revenue trend") });
}

export const DESIGNS = { workspace, dashboard, hub, overview, department, minimal, signature };

export function render(design, root, pack, data, options) {
	bindActions(root);
	root.setAttribute("data-design", design);
	(DESIGNS[design] || dashboard)(root, pack, data, options);
}
