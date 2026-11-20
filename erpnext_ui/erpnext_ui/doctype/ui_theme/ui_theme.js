// Copyright (c) 2026, Skydot Infotech and contributors
// For license information, please see license.txt

const UI_THEME_COLOUR_FIELDS = [
	"primary",
	"primary_contrast",
	"secondary",
	"background",
	"surface",
	"surface_elevated",
	"surface_muted",
	"control_bg",
	"navbar_bg",
	"sidebar_bg",
	"sidebar_text",
	"sidebar_active_bg",
	"sidebar_active_text",
	"text",
	"text_secondary",
	"text_muted",
	"border",
	"border_strong",
	"success",
	"warning",
	"danger",
	"info",
	"hover",
	"focus",
	"disabled_bg",
	"disabled_text",
];

frappe.ui.form.on("UI Theme", {
	setup(frm) {
		frm.set_query("based_on", () => ({
			filters: { mode: frm.doc.mode, name: ["!=", frm.doc.name || ""] },
		}));
	},

	refresh(frm) {
		ui_theme_form.render_preview(frm);
		if (frm.doc.is_standard) {
			frm.set_intro(
				__(
					"Standard presets are maintained by the ERPNext UI app. You can enable, disable or reorder them. To change colours, create a custom theme based on this one."
				),
				"blue"
			);
			frm.disable_form();
			frm.set_df_property("enabled", "read_only", 0);
			frm.set_df_property("sort_order", "read_only", 0);
			frm.enable_save();
			frm.add_custom_button(__("Create Custom Theme"), () => ui_theme_form.duplicate(frm));
		}
		const ns = window.erpnext_ui;
		if (!frm.is_new() && frm.doc.enabled && ns && ns.engine && ns.engine.active) {
			frm.add_custom_button(__("Preview"), () => ui_theme_form.preview(frm));
		}
	},

	mode(frm) {
		if (frm.doc.based_on) frm.set_value("based_on", "");
		ui_theme_form.render_preview(frm);
	},

	...Object.fromEntries(
		UI_THEME_COLOUR_FIELDS.map((f) => [f, (frm) => ui_theme_form.render_preview(frm)])
	),
});

// Design recipe fields (theme/tokens.py RECIPES).
const UI_THEME_RECIPE_FIELDS = [
	"sidebar_style",
	"navbar_style",
	"surface_style",
	"input_style",
	"table_style",
	"button_shape",
	"backdrop",
	"heading_font",
	"numeral_style",
];

const ui_theme_form = {
	tokens(frm) {
		const tokens = {};
		for (const field of UI_THEME_COLOUR_FIELDS) {
			if (frm.doc[field]) tokens[field.replace(/_/g, "-")] = frm.doc[field];
		}
		return tokens;
	},

	render_preview(frm) {
		const ns = window.erpnext_ui;
		const $wrapper = frm.get_field("preview_html").$wrapper;
		if (!ns || !ns.ui) {
			$wrapper.empty();
			return;
		}
		const theme = {
			name: frm.doc.theme_name || __("New Theme"),
			description: frm.doc.description || "",
			tokens: this.tokens(frm),
		};
		$wrapper.html('<div style="max-width: 280px"></div>');
		ns.ui.renderGallery($wrapper.children()[0], [theme], { disabled: true });
		if (frm.doc.based_on) {
			$wrapper.append(
				`<p class="text-muted small mt-2">${__(
					"Empty colours are inherited from {0}; the sample shows only the colours entered here.",
					[frappe.utils.escape_html(frm.doc.based_on)]
				)}</p>`
			);
		}
	},

	preview(frm) {
		const ns = window.erpnext_ui;
		const slot = frm.doc.mode === "Dark" ? "dark_theme" : "light_theme";
		ns.engine.preview({
			[slot]: frm.doc.name,
			force_mode: frm.doc.mode.toLowerCase(),
			route: frappe.get_route_str(),
		});
		frm.dashboard.clear_headline();
		frm.dashboard.set_headline_alert(
			__("Previewing {0} in this tab only. The preview ends when you leave this page.", [
				frappe.utils.escape_html(frm.doc.name),
			]),
			"blue"
		);
	},

	duplicate(frm) {
		const values = { mode: frm.doc.mode, based_on: frm.doc.name };
		for (const field of [
			...UI_THEME_COLOUR_FIELDS,
			"corner_radius",
			"shadow_style",
			"heading_weight",
			...UI_THEME_RECIPE_FIELDS,
		]) {
			values[field] = frm.doc[field];
		}
		frappe.new_doc("UI Theme", values);
	},
};
