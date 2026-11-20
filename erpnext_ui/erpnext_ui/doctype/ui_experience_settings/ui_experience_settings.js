// Copyright (c) 2026, Skydot Infotech and contributors
// For license information, please see license.txt

const PREVIEW_FIELDS = [
	"default_appearance",
	"default_light_theme",
	"default_dark_theme",
	"default_density",
	"default_font",
	"accent_color",
];

frappe.ui.form.on("UI Experience Settings", {
	refresh(frm) {
		const ns = window.erpnext_ui;
		frm.eui_previewing = ns && ns.engine && ns.engine.isPreviewing;
		erpnext_ui_settings.render_status(frm);
		erpnext_ui_settings.render_gallery(frm);
		erpnext_ui_settings.setup_buttons(frm);
	},

	after_save(frm) {
		const ns = window.erpnext_ui;
		if (ns && ns.preferences) {
			ns.preferences.refresh().then(() => erpnext_ui_settings.render_gallery(frm));
		}
	},

	...Object.fromEntries(
		PREVIEW_FIELDS.map((field) => [
			field,
			(frm) => {
				erpnext_ui_settings.render_gallery(frm);
				if (frm.eui_previewing) erpnext_ui_settings.preview(frm);
			},
		])
	),
});

const erpnext_ui_settings = {
	setup_buttons(frm) {
		const ns = window.erpnext_ui;
		frm.clear_custom_buttons();
		if (ns && ns.engine && ns.engine.active) {
			frm.add_custom_button(frm.eui_previewing ? __("End Preview") : __("Preview"), () =>
				frm.eui_previewing ? this.end_preview(frm) : this.preview(frm)
			);
		}
		frm.add_custom_button(__("Reset to Defaults"), () => this.reset(frm));
		frm.add_custom_button(__("My Appearance & Theme"), () =>
			frappe.set_route("ui-preferences")
		);
		frm.add_custom_button(__("Manage Themes"), () => frappe.set_route("List", "UI Theme"));
		if (ns && ns.engine && ns.engine.active && frappe.model.can_create("UI Theme")) {
			frm.add_custom_button(__("Create Theme from Colours"), () => this.colour_dialog());
		}
	},

	/**
	 * Custom colour engine: two colours, a mode and a treatment in; a complete
	 * theme out (theme/generator.py). Every change is previewed on the real
	 * Desk; nothing is stored until Create Theme.
	 */
	colour_dialog() {
		const ns = window.erpnext_ui;
		const esc = frappe.utils.escape_html;
		const d = new frappe.ui.Dialog({
			title: __("Create Theme from Colours"),
			size: "large",
			fields: [
				{ fieldname: "theme_name", fieldtype: "Data", label: __("Theme Name"), reqd: 1 },
				{ fieldname: "column_break_1", fieldtype: "Column Break" },
				{ fieldname: "mode", fieldtype: "Select", label: __("Mode"), options: "Light\nDark", default: "Light" },
				{ fieldname: "section_colours", fieldtype: "Section Break" },
				{ fieldname: "primary", fieldtype: "Color", label: __("Primary Colour"), reqd: 1, default: "#2b5d8f" },
				{ fieldname: "column_break_2", fieldtype: "Column Break" },
				{ fieldname: "secondary", fieldtype: "Color", label: __("Secondary Colour"), reqd: 1, default: "#c0782d" },
				{ fieldname: "column_break_3", fieldtype: "Column Break" },
				{
					fieldname: "strength",
					fieldtype: "Select",
					label: __("Treatment"),
					options: "Subtle\nStrong",
					default: "Subtle",
					description: __("Subtle keeps surfaces neutral. Strong fills the sidebar with the primary colour and tints the page."),
				},
				{ fieldname: "section_report", fieldtype: "Section Break", label: __("Readability") },
				{ fieldname: "report", fieldtype: "HTML" },
			],
			primary_action_label: __("Create Theme"),
			primary_action: async (values) => {
				const name = await frappe.xcall("erpnext_ui.api.theme.create_custom_theme", values);
				d.hide();
				frappe.show_alert({ message: __("Theme {0} created", [esc(name)]), indicator: "green" });
				frappe.set_route("Form", "UI Theme", name);
			},
		});
		let timer = null;
		const update = () => {
			clearTimeout(timer);
			timer = setTimeout(async () => {
				const v = d.get_values(true);
				if (!v.primary || !v.secondary) return;
				try {
					const r = await frappe.xcall("erpnext_ui.api.theme.generate_theme", {
						primary: v.primary,
						secondary: v.secondary,
						mode: v.mode,
						strength: v.strength,
					});
					const slot = r.theme.mode === "Dark" ? "dark_theme" : "light_theme";
					ns.engine.preview({
						catalog: [...ns.engine.config.catalog, r.theme],
						[slot]: r.theme.name,
						force_mode: r.theme.mode.toLowerCase(),
					});
					d.fields_dict.report.$wrapper.html(
						`<table class="table table-sm eui-contrast-report"><tbody>${r.contrast
							.map(
								(row) => `<tr><td>${esc(row.foreground)} on ${esc(row.background)}</td>
								<td class="text-right">${row.ratio}</td><td>${row.ok ? "✓" : "✗"} ≥ ${row.minimum}</td></tr>`
							)
							.join("")}</tbody></table>
						<p class="text-muted small">${__("The Desk behind this dialog shows the theme. Colours are adjusted automatically until every pair is readable.")}</p>`
					);
				} catch (e) {
					d.fields_dict.report.$wrapper.html(`<p class="text-danger">${esc(e.message || e)}</p>`);
				}
			}, 200);
		};
		for (const f of ["primary", "secondary", "mode", "strength"]) {
			d.fields_dict[f].df.onchange = update;
		}
		d.onhide = () => ns.engine.endPreview();
		d.show();
		update();
	},

	async preview(frm) {
		const ns = window.erpnext_ui;
		if (!ns || !ns.engine || !ns.engine.active) return;
		const doc = frm.doc;
		let catalog;
		if (doc.accent_color) {
			catalog = await ns.preferences.previewCatalog(doc.accent_color);
		}
		const shown = ns.engine.preview({
			appearance: doc.default_appearance,
			light_theme: doc.default_light_theme,
			dark_theme: doc.default_dark_theme,
			density: doc.default_density,
			font: doc.default_font,
			catalog,
			route: frappe.get_route_str(),
		});
		frm.eui_previewing = shown;
		frm.dashboard.clear_headline();
		if (shown) {
			frm.dashboard.set_headline_alert(
				__(
					"Previewing these settings in this browser tab only. Nobody else sees them until you save. The preview ends when you leave this page."
				),
				"blue"
			);
		}
		this.setup_buttons(frm);
	},

	end_preview(frm) {
		const ns = window.erpnext_ui;
		ns && ns.engine && ns.engine.endPreview();
		frm.eui_previewing = false;
		frm.dashboard.clear_headline();
		this.setup_buttons(frm);
	},

	reset(frm) {
		frappe.confirm(
			__(
				"Restore every setting on this page to its shipped default? Users' personal choices are not affected."
			),
			async () => {
				const ns = window.erpnext_ui;
				if (ns && ns.preferences) await ns.preferences.resetSettings();
				else await frappe.xcall("erpnext_ui.api.settings.reset_settings");
				this.end_preview(frm);
				await frm.reload_doc();
				frappe.show_alert({
					message: __("Settings restored to defaults"),
					indicator: "green",
				});
			}
		);
	},

	async render_status(frm) {
		const $wrapper = frm.get_field("status_html").$wrapper;
		let status;
		try {
			status = await frappe.xcall("erpnext_ui.api.settings.get_status", {}, "GET");
		} catch (e) {
			$wrapper.empty();
			return;
		}
		const ns = window.erpnext_ui;
		const engine = ns && ns.engine;
		const esc = frappe.utils.escape_html;
		let engine_state = __("Not loaded");
		if (engine) {
			engine_state = engine.active
				? __("Active ({0})", [esc(engine.current.theme)])
				: __("Inactive: {0}", [esc(engine.reason || "")]);
		}
		const layout = ns && ns.layout;
		const layout_state =
			layout && layout.active
				? __("Active ({0} preset)", [esc(__(layout.current.preset))])
				: __("Off");
		const versions = status.versions || {};
		$wrapper.html(`
			<dl class="eui-status-grid">
				<div><dt>${__("Theme engine")}</dt><dd>${engine_state}</dd></div>
				<div><dt>${__("Layout engine")}</dt><dd>${layout_state}</dd></div>
				<div><dt>${__("Frappe")}</dt><dd>${esc(versions.frappe || "-")}</dd></div>
				<div><dt>${__("ERPNext")}</dt><dd>${esc(versions.erpnext || __("Not installed"))}</dd></div>
				<div><dt>${__("Desk adapter")}</dt><dd>${
			status.adapter ? esc(status.adapter) : __("None (version not supported)")
		}</dd></div>
				<div><dt>${__("Tested with")}</dt><dd>Frappe ${esc(status.tested.frappe)}, ERPNext ${esc(
			status.tested.erpnext
		)}</dd></div>
			</dl>`);
	},

	render_gallery(frm) {
		const ns = window.erpnext_ui;
		const $wrapper = frm.get_field("gallery_html").$wrapper;
		if (!ns || !ns.engine || !ns.engine.config.catalog) {
			$wrapper.html(
				`<div class="eui-notice">${__(
					"The theme gallery is shown when UI Experience is enabled and the page is reloaded."
				)}</div>`
			);
			return;
		}
		const catalog = ns.engine.config.catalog;
		$wrapper.html(`
			<p class="eui-section-help">${__(
				"Select a card to make it the default light or dark theme, then Save. Disabled themes are not listed."
			)}</p>
			<h5 class="eui-section-title">${__("Light Themes")}</h5>
			<div data-gallery="Light" class="mb-4"></div>
			<h5 class="eui-section-title">${__("Dark Themes")}</h5>
			<div data-gallery="Dark"></div>`);
		for (const mode of ["Light", "Dark"]) {
			const field = mode === "Light" ? "default_light_theme" : "default_dark_theme";
			ns.ui.renderGallery(
				$wrapper.find(`[data-gallery="${mode}"]`)[0],
				catalog.filter((t) => t.mode === mode),
				{
					selected: frm.doc[field],
					onSelect: (name) => frm.set_value(field, name),
					badgesFor: (theme) =>
						theme.name === frm.doc[field]
							? [{ label: __("Default"), current: true }]
							: [],
				}
			);
		}
	},
};
