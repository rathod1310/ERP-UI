// The experience home page (Phase 3, M3). Desk opens it for the empty route
// when the active experience has its own home design (see boot.py and
// experience/engine.js). The designs live in the lazily loaded
// erpnext_ui_home bundle; this file only decides which one to show.
//
// If the engine is not running, or the experience (or a preview) uses
// Frappe's own workspace as its home, the page hands over to the native home.

frappe.pages["ui-home"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Home"), single_column: true });
	wrapper.eui_home = { page, design: null };
	document.addEventListener("erpnext-ui:experience-applied", () => {
		if (frappe.get_route_str() === "ui-home" || frappe.get_route_str() === "") eui_home_show(wrapper);
	});
};

frappe.pages["ui-home"].on_page_show = function (wrapper) {
	eui_home_show(wrapper);
};

function eui_home_show(wrapper) {
	const ns = window.erpnext_ui;
	const shown = ns && ns.experience && ns.experience.active && ns.experience.shown();
	const native = (ns && ns.experience && ns.experience.nativeHome) || "workspace";
	if (!shown || !shown.custom_home) {
		if (frappe.boot.home_page === "ui-home") frappe.boot.home_page = native;
		frappe.set_route(native === "ui-home" ? "workspace" : native);
		return;
	}
	const state = wrapper.eui_home;
	// The launcher is the navigation on its own home, so the sidebar steps
	// aside there (Frappe's own page option; every other page keeps it).
	// Phones keep Frappe's overlay sidebar.
	const hide = shown.shell.home === "hub" && !frappe.is_mobile();
	if (state.page.hide_sidebar !== hide) {
		state.page.hide_sidebar = hide;
		frappe.app && frappe.app.sidebar && frappe.app.sidebar.toggle(hide);
	}
	frappe.require("erpnext_ui_home.bundle.js", () => {
		const home = window.erpnext_ui && window.erpnext_ui.home;
		if (!home) return;
		if (state.design === shown.shell.home && state.key === shown.key && state.mounted) {
			home.refresh(state);
			return;
		}
		state.design = shown.shell.home;
		state.key = shown.key;
		state.mounted = true;
		home.mount(state, shown);
	});
}
