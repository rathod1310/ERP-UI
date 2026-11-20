// Experience home designs, loaded on demand by the ui-home page
// (frappe.require("erpnext_ui_home.bundle.js")). Exposes
// window.erpnext_ui.home = { mount, refresh }.

import { render, savedDepartment } from "./home/designs.js";

const API = "erpnext_ui.api.home.get_home";

async function load(state, pack, { refresh = false, department } = {}) {
	const design = pack.shell.home;
	const root = state.root;
	root.classList.add("is-loading");
	try {
		const data = await frappe.xcall(
			API,
			{ design, department: department || (design === "department" ? savedDepartment() : null), refresh: refresh ? 1 : 0 },
			"GET"
		);
		render(design, root, pack, data, { reload: (key) => load(state, pack, { department: key }) });
	} catch (e) {
		root.innerHTML = `<div class="eui-home-empty">${frappe.utils.escape_html(
			__("The home page could not be loaded. Open a workspace from the sidebar, or reload the page.")
		)}</div>`;
	} finally {
		root.classList.remove("is-loading");
	}
}

function mount(state, pack) {
	const main = state.page.main[0] || state.page.main;
	main.innerHTML = '<div class="eui-home"></div>';
	state.root = main.querySelector(".eui-home");
	state.pack = pack;
	state.page.set_title(__("Home"));
	state.page.clear_menu && state.page.clear_menu();
	state.page.set_secondary_action && state.page.set_secondary_action(__("Refresh"), () => load(state, state.pack, { refresh: true }), "refresh");
	return load(state, pack);
}

function refresh(state) {
	if (!state.root) return null;
	return load(state, state.pack);
}

window.erpnext_ui = window.erpnext_ui || {};
window.erpnext_ui.home = { mount, refresh };
