// "All apps" in the active experience's own style: every application and the
// modules inside it, with a live filter. Opened by the sidebar menu's
// "All apps" row (see adapters/v16.js installAllApps). The page itself lives
// in the lazily loaded erpnext_ui_home bundle.

frappe.pages["ui-apps"].on_page_load = function (wrapper) {
	// The page is the navigation, so the module sidebar steps aside (Frappe's
	// own page option; Desk restores it on the next page). Phones keep the
	// drawer, and the dock stays for search, notifications and the user menu.
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("All Apps"),
		single_column: true,
		hide_sidebar: true,
	});
	wrapper.eui_apps = { page };
};

frappe.pages["ui-apps"].on_page_show = function (wrapper) {
	const hide = !frappe.is_mobile();
	wrapper.eui_apps.page.hide_sidebar = hide;
	if (hide && frappe.app && frappe.app.sidebar && typeof frappe.app.sidebar.toggle === "function")
		frappe.app.sidebar.toggle(true);
	frappe.require("erpnext_ui_home.bundle.js", () => {
		const home = window.erpnext_ui && window.erpnext_ui.home;
		if (home && home.mountApps) home.mountApps(wrapper.eui_apps);
	});
};
