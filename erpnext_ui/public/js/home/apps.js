// The "All apps" page (ui-apps) in the experience's own style. It lists what
// Frappe already allows this user: the apps on the apps screen
// (frappe.boot.app_data) and, on v17, each app's modules
// (frappe.boot.module_sidebars, permission-resolved on the server). v16 has
// no module sidebars, so its workspaces are shown instead.

import { esc, icon, navigableWorkspaces, workspaceRoute } from "./common.js";

function sidebar() {
	return frappe.app && frappe.app.sidebar;
}

function logoOf(app) {
	const url = Array.isArray(app.app_logo_url) ? app.app_logo_url[0] : app.app_logo_url;
	return url || null;
}

function appRoute(app) {
	const s = sidebar();
	let route = null;
	try {
		route = s && typeof s.app_landing_route === "function" ? s.app_landing_route(app) : null;
	} catch (e) {
		route = null;
	}
	return route || app.app_route || app.desk_route || null;
}

function moduleRoute(key) {
	const s = sidebar();
	try {
		return s && typeof s.module_landing_route === "function" ? s.module_landing_route(key) : null;
	} catch (e) {
		return null;
	}
}

function moduleIcon(key, entry) {
	if (entry && entry.header_icon) return entry.header_icon;
	if (typeof frappe.get_module_icon === "function") {
		try {
			return frappe.get_module_icon(key) || "folder-normal";
		} catch (e) {
			return "folder-normal";
		}
	}
	return "folder-normal";
}

export function collectApps() {
	return (frappe.boot.app_data || [])
		.filter((a) => a && a.on_apps_screen)
		.sort((a, b) => (a.sequence_id ?? 100) - (b.sequence_id ?? 100))
		.map((a) => ({ name: a.app_name, title: __(a.app_title || a.app_name), logo: logoOf(a), href: appRoute(a) }))
		.filter((a) => a.href);
}

/** [{ app, title, logo, modules: [{ name, title, icon, href }] }] */
export function collectGroups(apps) {
	const shells = frappe.boot.module_sidebars;
	if (!shells || !Object.keys(shells).length) {
		const pages = navigableWorkspaces().map((p) => ({
			name: p.name,
			title: __(p.title || p.name),
			icon: p.icon || "folder-normal",
			href: workspaceRoute(p),
		}));
		return pages.length ? [{ app: "workspaces", title: __("Workspaces"), logo: null, modules: pages }] : [];
	}
	const byApp = new Map();
	for (const [key, entry] of Object.entries(shells)) {
		const href = moduleRoute(key);
		if (!href || !href.startsWith("/desk/")) continue;
		const app = (entry && entry.app) || "other";
		if (!byApp.has(app)) byApp.set(app, []);
		byApp.get(app).push({ name: key, title: __((entry && entry.label) || key), icon: moduleIcon(key, entry), href });
	}
	const known = new Map((frappe.boot.app_data || []).map((a) => [a.app_name, a]));
	const order = apps.map((a) => a.name);
	return [...byApp.entries()]
		.map(([app, modules]) => {
			const meta = known.get(app);
			return {
				app,
				title: meta ? __(meta.app_title || app) : __("Other"),
				logo: meta ? logoOf(meta) : null,
				modules: modules.sort((a, b) => a.title.localeCompare(b.title)),
			};
		})
		.sort((a, b) => {
			const ia = order.indexOf(a.app);
			const ib = order.indexOf(b.app);
			return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
		});
}

function mark(logo, title, cls) {
	return logo
		? `<span class="${cls}"><img src="${esc(logo)}" alt=""></span>`
		: `<span class="${cls} is-letter">${esc((title || "?").trim().charAt(0).toUpperCase())}</span>`;
}

function link(href, cls, inner, search) {
	const external = /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
	return `<a class="${cls}" href="${esc(href)}" data-eui-find="${esc(search.toLowerCase())}"${
		external ? ' target="_blank" rel="noopener"' : ""
	}>${inner}</a>`;
}

export function renderApps(root) {
	const brand = (frappe.boot.erpnext_ui && frappe.boot.erpnext_ui.brand) || {};
	const apps = collectApps();
	const groups = collectGroups(apps);
	const moduleCount = groups.reduce((n, g) => n + g.modules.length, 0);
	root.innerHTML = `
		<header class="eui-apps-head">
			<div>
				<small>${esc(brand.name || "")}</small>
				<h2>${esc(__("All Apps"))}</h2>
				<p>${esc(__("{0} applications · {1} modules", [apps.length, moduleCount]))}</p>
			</div>
			<label class="eui-apps-filter">${icon("search", "sm")}<input type="search" data-eui-filter placeholder="${esc(
				__("Filter apps and modules")
			)}" aria-label="${esc(__("Filter apps and modules"))}"></label>
		</header>
		${
			apps.length
				? `<section class="eui-apps-section" data-eui-group><h3 class="eui-apps-label">${esc(__("Applications"))}</h3><div class="eui-apps-cards">${apps
						.map((a) =>
							link(
								a.href,
								"eui-apps-card",
								`${mark(a.logo, a.title, "eui-apps-logo")}<span class="eui-apps-card-text"><b>${esc(a.title)}</b><small>${esc(
									__("Open")
								)}</small></span>`,
								a.title
							)
						)
						.join("")}</div></section>`
				: ""
		}
		${groups
			.map(
				(g) => `<section class="eui-apps-section" data-eui-group>
					<h3 class="eui-apps-label">${g.logo ? `<img src="${esc(g.logo)}" alt="">` : ""}${esc(g.title)}<span>${g.modules.length}</span></h3>
					<div class="eui-apps-tiles">${g.modules
						.map((m) =>
							link(m.href, "eui-apps-tile", `<span class="eui-apps-tile-icon">${icon(m.icon, "md")}</span><span>${esc(m.title)}</span>`, `${m.title} ${g.title}`)
						)
						.join("")}</div></section>`
			)
			.join("")}
		<div class="eui-home-empty" data-eui-none hidden>${esc(__("Nothing matches your filter."))}</div>
		${!apps.length && !groups.length ? `<div class="eui-home-empty">${esc(__("No apps are available to you yet."))}</div>` : ""}`;

	// A logo that fails to load becomes the app's initial.
	root.querySelectorAll(".eui-apps-logo img, .eui-apps-label img").forEach((img) =>
		img.addEventListener(
			"error",
			() => {
				const box = img.parentElement;
				if (box && box.classList.contains("eui-apps-logo")) {
					const title = (box.closest(".eui-apps-card") || box).textContent.trim();
					box.classList.add("is-letter");
					box.textContent = (title || "?").charAt(0).toUpperCase();
				} else {
					img.remove();
				}
			},
			{ once: true }
		)
	);

	const input = root.querySelector("[data-eui-filter]");
	const none = root.querySelector("[data-eui-none]");
	input.addEventListener("input", () => {
		const q = input.value.trim().toLowerCase();
		let shown = 0;
		root.querySelectorAll("[data-eui-group]").forEach((section) => {
			let visible = 0;
			section.querySelectorAll("[data-eui-find]").forEach((el) => {
				const hit = !q || el.getAttribute("data-eui-find").includes(q);
				el.hidden = !hit;
				if (hit) visible++;
			});
			section.hidden = !visible;
			shown += visible;
		});
		none.hidden = shown > 0;
	});
	return { apps: apps.length, modules: moduleCount };
}

export function mountApps(state) {
	const main = state.page.main[0] || state.page.main;
	if (!state.root) {
		main.innerHTML = '<div class="eui-home eui-apps" data-design="apps"></div>';
		state.root = main.querySelector(".eui-apps");
	}
	state.page.set_title(__("All Apps"));
	renderApps(state.root);
	const input = state.root.querySelector("[data-eui-filter]");
	if (input && !frappe.is_mobile()) input.focus({ preventScroll: true });
}
