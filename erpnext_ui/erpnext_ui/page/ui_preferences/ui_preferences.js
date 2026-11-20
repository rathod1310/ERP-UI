// "Appearance & Theme": choose a complete ERPNext experience, look inside it,
// preview it on the whole Desk, then apply it. Individual adjustments (theme,
// density, font, layout) are secondary, under Advanced, and are stored as the
// user's adjustments to the chosen experience; the experience itself is never
// changed. The draft lives in the shared customization session
// (window.erpnext_ui.customize), so a preview stays visible on other pages
// with a preview bar until it is applied or cancelled.

frappe.pages["ui-preferences"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Appearance & Theme"),
		single_column: true,
	});
	wrapper.eui_page = new UIPreferencesPage(page, wrapper);
};

frappe.pages["ui-preferences"].on_page_show = function (wrapper) {
	wrapper.eui_page && wrapper.eui_page.show();
};

const EUI_VIEWS = [
	["home", __("Home")],
	["form", __("Sales Invoice")],
	["list", __("List")],
	["report", __("Report")],
];

const EUI_ADJUST_LABELS = {
	light_theme: __("Light Theme"),
	dark_theme: __("Dark Theme"),
	density: __("Density"),
	font: __("Font"),
	navigation: __("Navigation"),
	workspace_format: __("Workspace"),
	form_format: __("Forms"),
	list_format: __("Lists and Tables"),
	content_width: __("Content Width"),
	card_style: __("Cards"),
	page_background: __("Page Background"),
};

class UIPreferencesPage {
	constructor(page, wrapper) {
		this.page = page;
		this.ns = window.erpnext_ui;
		this.$body = $('<div class="eui-preferences-page"></div>').appendTo(page.main);
		this.inspected = null;
		this.view = "home";
		if (!this.ns || !this.ns.engine) {
			this.notice(__("The UI Experience engine did not load. Try reloading the page."));
			return;
		}
		this.engine = this.ns.engine;
		this.layout = this.ns.layout;
		this.experience = this.ns.experience;
		this.session = this.ns.customize;
		if (!this.engine.config.enabled) {
			this.notice(__("UI Experience is turned off for this site."), true);
			return;
		}
		if (!this.engine.active || !this.session || !this.experience || !this.experience.config) {
			this.notice(__("Experiences are not available on this Frappe version. Native styling is in use."), true);
			return;
		}
		this.ready = true;
		this.setup_actions();
		this.make();
		this.show();
		// Re-render when the preview bar applies or cancels while this page is open.
		document.addEventListener(this.ns.events.customize, () => this.ready && this.render());
		this._resize = frappe.utils.debounce(() => this.ns.ui.scaleSketches(this.$body[0]), 100);
		window.addEventListener("resize", this._resize);
	}

	get config() {
		return this.engine.config;
	}

	get xp() {
		return this.experience.config;
	}

	/** False on a site that shares the app code but has not been migrated. */
	get siteReady() {
		return this.xp.home_available !== false;
	}

	notice(message, offer_settings) {
		this.$body.html(`<div class="eui-notice">${frappe.utils.escape_html(message)}</div>`);
		if (offer_settings && frappe.user.has_role("System Manager")) {
			this.page.set_primary_action(__("Open UI Experience Settings"), () =>
				frappe.set_route("Form", "UI Experience Settings")
			);
		}
	}

	setup_actions() {
		this.page.set_primary_action(__("Apply to Me"), () => this.save(), "check");
		this.page.set_secondary_action(__("Reset to Site Default"), () => this.reset());
		this.page.add_menu_item(__("Discard Changes"), () => {
			this.session.cancel();
			this.render();
		});
		this.page.add_menu_item(__("Restore Experience Defaults"), () => this.restore());
		if (this.config.can_manage) {
			this.page.add_menu_item(__("Set as Site Default"), () => this.publish());
			this.page.add_menu_item(__("UI Experience Settings"), () =>
				frappe.set_route("Form", "UI Experience Settings")
			);
			this.page.add_menu_item(__("Manage Experiences"), () => frappe.set_route("List", "UI Experience"));
			this.page.add_menu_item(__("Manage Themes"), () => frappe.set_route("List", "UI Theme"));
		}
	}

	show() {
		if (!this.ready) return;
		this.session.begin();
		if (!this.inspected) this.inspected = this.session.draft.experience || this.xp.key;
		this.render();
	}

	make() {
		this.$body.html(`
			<div class="eui-xp-intro">
				<div>
					<h4 class="eui-section-title">${__("Choose your SKYDOTERP experience")}</h4>
					<p>${__(
						"Each experience sets the navigation, home page, forms, lists, reports, colours and density together. Look inside one, preview it on every page, then apply it. Nothing is saved until you choose Apply to Me."
					)}</p>
				</div>
				<div data-control="appearance"></div>
			</div>
			<div class="eui-notice" data-site-not-updated hidden>${__(
				"This site has not been updated for Experience Packs yet, so the Desk cannot change here. An administrator needs to run bench migrate for this site. Until then the Desk keeps its current home page and you can only look at the previews."
			)}</div>
			<p class="eui-locked" data-locked="experience" hidden></p>
			<div class="eui-xp-gallery" data-gallery="experiences"></div>
			<div class="eui-xp-detail" data-detail></div>
			<details class="eui-advanced" data-advanced>
				<summary>${__("Advanced")}<span>${__(
					"Adjust colours, font, density and layout of the selected experience for yourself"
				)}</span></summary>
				<p class="eui-section-help" data-advanced-note></p>
				<section class="eui-section"><h4 class="eui-section-title">${__("Themes")}</h4>
					<p class="eui-locked" data-locked="theme" hidden>${__(
						"Your administrator has chosen the theme for everyone."
					)}</p>
					<div class="eui-subsection"><h5 class="eui-subsection-title">${__("Light Theme")}</h5><div data-gallery="Light"></div></div>
					<div class="eui-subsection"><h5 class="eui-subsection-title">${__("Dark Theme")}</h5><div data-gallery="Dark"></div></div>
				</section>
				<section class="eui-section"><h4 class="eui-section-title">${__("Typography and Density")}</h4>
					<div class="eui-subsection"><h5 class="eui-subsection-title">${__("Density")}</h5><div data-control="density"></div></div>
					<div class="eui-subsection"><h5 class="eui-subsection-title">${__("Font")}</h5>
						<p class="eui-locked">${__("Fonts are loaded from Frappe or your operating system; nothing is downloaded.")}</p>
						<div data-control="font"></div></div>
				</section>
				<section class="eui-section" data-layout-section><h4 class="eui-section-title">${__("Layout")}</h4>
					${["navigation", "workspace_format", "form_format", "list_format", "content_width", "card_style", "page_background"]
						.map(
							(key) => `<div class="eui-subsection"><h5 class="eui-subsection-title">${EUI_ADJUST_LABELS[key]}</h5>
							<p class="eui-locked" data-locked="${key}" hidden>${__("Set by your administrator for everyone.")}</p>
							<div data-control="${key}"></div></div>`
						)
						.join("")}
				</section>
			</details>
		`);
		this.$body.on("click", "[data-xp-card]", (e) => {
			this.inspected = e.currentTarget.getAttribute("data-xp-card");
			this.render();
		});
		this.$body.on("click", "[data-xp-view]", (e) => {
			this.view = e.currentTarget.getAttribute("data-xp-view");
			this.render_detail();
		});
		this.$body.on("click", "[data-xp-action]", (e) => this.act(e.currentTarget.getAttribute("data-xp-action")));
	}

	control(attr) {
		return this.$body.find(`[data-control="${attr}"]`)[0];
	}

	pack(key) {
		return this.ns.experienceResolve.findPack(this.xp, key);
	}

	/** The pack's theme for the mode the user is looking at. */
	themeFor(pack, dark) {
		const name = dark ? pack.selection.dark_theme : pack.selection.light_theme;
		const mode = dark ? "Dark" : "Light";
		return this.config.catalog.find((t) => t.name === name && t.mode === mode) || null;
	}

	isDark() {
		const r = this.ns.resolve.resolveMode(this.session.draft.appearance, this.engine.prefersDark());
		return r === "dark";
	}

	render() {
		if (!this.session.draft) this.session.begin();
		if (!this.pack(this.inspected)) this.inspected = this.session.draft.experience || this.xp.key;
		const ui = this.ns.ui;
		const draft = this.session.draft;
		ui.renderSegmented(
			this.control("appearance"),
			[
				{ value: "Light", label: __("Light") },
				{ value: "Dark", label: __("Dark") },
				{ value: "Automatic", label: __("Automatic") },
			],
			{
				selected: draft.appearance,
				label: __("Appearance"),
				onSelect: (v) => {
					this.session.set("appearance", v);
					this.render();
				},
			}
		);
		this.$body.find("[data-site-not-updated]").prop("hidden", this.siteReady);
		const $lock = this.$body.find('[data-locked="experience"]');
		$lock.prop("hidden", this.xp.allow_user_experience);
		$lock.text(
			__("Your administrator has chosen {0} for everyone.", [this.pack(this.xp.key).title]) +
				(this.config.can_manage ? " " + __("As an administrator you can still set the site default.") : "")
		);
		this.render_gallery();
		this.render_detail();
		this.render_advanced();
		ui.scaleSketches(this.$body[0]);
	}

	badges(pack) {
		const draft = this.session.draft;
		const out = [];
		if (pack.key === this.xp.key) out.push(`<span class="eui-badge is-current">${__("Active")}</span>`);
		if (pack.key === draft.experience && draft.experience !== this.xp.key)
			out.push(`<span class="eui-badge is-current">${__("Previewing")}</span>`);
		if (pack.key === this.xp.site_default) out.push(`<span class="eui-badge">${__("Site Default")}</span>`);
		if (pack.overridden.length) out.push(`<span class="eui-badge">${__("Adjusted")}</span>`);
		return out.join("");
	}

	render_gallery() {
		const esc = frappe.utils.escape_html;
		const dark = this.isDark();
		const html = this.xp.available
			.map(
				(pack) => `<button type="button" class="eui-xp-card" data-xp-card="${esc(pack.key)}" aria-pressed="${
					pack.key === this.inspected
				}">
				${this.ns.ui.sketchHtml(pack, "home", this.themeFor(pack, dark), { dark })}
				<span class="eui-xp-card-body">
					<span class="eui-xp-card-title">${esc(__(pack.title))}</span>
					<span class="eui-xp-card-text">${esc(__(pack.description))}</span>
					<span class="eui-xp-badges">${this.badges(pack)}</span>
				</span></button>`
			)
			.join("");
		this.$body.find('[data-gallery="experiences"]').html(html);
	}

	render_detail() {
		const esc = frappe.utils.escape_html;
		const pack = this.pack(this.inspected);
		const draft = this.session.draft;
		const dark = this.isDark();
		const isDraft = pack.key === draft.experience;
		const isSaved = pack.key === this.xp.key;
		const canChoose = this.xp.allow_user_experience && this.siteReady;
		const theme = this.themeFor(pack, dark);
		const adjusted = pack.overridden.map((k) => EUI_ADJUST_LABELS[k] || k);
		const buttons = [];
		if (canChoose && !isDraft)
			buttons.push(`<button type="button" class="btn btn-default btn-sm" data-xp-action="preview">${__("Preview on my Desk")}</button>`);
		if (canChoose)
			buttons.push(
				`<button type="button" class="btn btn-primary btn-sm" data-xp-action="apply" ${
					isSaved && !this.session.isDirty() ? "disabled" : ""
				}>${isSaved && !this.session.isDirty() ? __("Applied") : __("Apply to Me")}</button>`
			);
		if (this.config.can_manage && this.siteReady && pack.key !== this.xp.site_default)
			buttons.push(`<button type="button" class="btn btn-default btn-sm" data-xp-action="site">${__("Set as Site Default")}</button>`);
		if (pack.overridden.length)
			buttons.push(`<button type="button" class="btn btn-default btn-sm" data-xp-action="restore">${__("Restore Experience Defaults")}</button>`);
		const views = EUI_VIEWS.map(
			([v, label]) => `<button type="button" role="tab" aria-selected="${this.view === v}" data-xp-view="${v}">${label}</button>`
		).join("");
		this.$body.find("[data-detail]").html(`
			<div class="eui-xp-detail-head">
				<div><h4>${esc(__(pack.title))}</h4><p>${esc(__(pack.description))}</p>
				${pack.audience ? `<p>${esc(__("For: {0}", [__(pack.audience)]))}</p>` : ""}</div>
				<div class="eui-xp-actions">${buttons.join("")}</div>
			</div>
			<div class="eui-xp-views" role="tablist" aria-label="${__("Preview page")}">${views}</div>
			<div class="eui-xp-preview">${this.ns.ui.sketchHtml(pack, this.view, theme, { dark })}</div>
			<dl class="eui-xp-facts">
				<div><dt>${__("Theme")}</dt><dd>${esc(__(pack.selection.light_theme || ""))} · ${esc(__(pack.selection.dark_theme || ""))}</dd></div>
				${pack.compatible_themes.length ? `<div><dt>${__("Also works with")}</dt><dd>${esc(pack.compatible_themes.map((t) => __(t)).join(", "))}</dd></div>` : ""}
				<div><dt>${__("Density")}</dt><dd>${esc(__(pack.selection.density || ""))}</dd></div>
				<div><dt>${__("Home")}</dt><dd>${esc(this.homeLabel(pack.shell.home))}</dd></div>
			</dl>
			${adjusted.length ? `<p class="eui-xp-adjusted">${esc(__("Your adjustments: {0}", [adjusted.join(", ")]))}</p>` : ""}
		`);
		this.ns.ui.scaleSketches(this.$body.find("[data-detail]")[0]);
	}

	homeLabel(home) {
		return (
			{
				workspace: __("Structured workspace"),
				dashboard: __("Modular dashboard"),
				hub: __("Application launcher"),
				overview: __("Executive overview"),
				department: __("Department board"),
				minimal: __("Minimal workspace"),
			}[home] || home
		);
	}

	render_advanced() {
		const ui = this.ns.ui;
		const draft = this.session.draft;
		const pack = this.pack(draft.experience) || this.pack(this.xp.key);
		const themeLocked = !this.xp.theme_open;
		const current = this.engine.current || {};
		const set = (key) => (value) => {
			this.session.set(key, value);
			this.render();
		};
		this.$body.find("[data-advanced-note]").text(
			__("These adjustments apply to {0} only. Restore Experience Defaults removes them.", [__(pack.title)])
		);
		this.$body.find('[data-locked="theme"]').prop("hidden", !themeLocked);
		for (const mode of ["Light", "Dark"]) {
			const slot = mode === "Light" ? "light_theme" : "dark_theme";
			ui.renderGallery(
				this.$body.find(`[data-gallery="${mode}"]`)[0],
				this.config.catalog.filter((t) => t.mode === mode),
				{
					selected: draft[slot],
					disabled: themeLocked,
					onSelect: set(slot),
					badgesFor: (theme) => {
						const badges = [];
						if (theme.name === current.theme) badges.push({ label: __("Showing"), current: true });
						if (theme.name === pack.defaults[slot]) badges.push({ label: __("Experience Default") });
						return badges;
					},
				}
			);
		}
		ui.renderSegmented(
			this.control("density"),
			["Compact", "Comfortable", "Spacious"].map((v) => ({ value: v, label: __(v) })),
			{ selected: draft.density, disabled: themeLocked, label: __("Density"), onSelect: set("density") }
		);
		ui.renderSegmented(
			this.control("font"),
			[
				{ value: "Inter", label: "Inter" },
				{ value: "System UI", label: __("System UI") },
				{ value: "Humanist Sans", label: __("Humanist Sans") },
			],
			{ selected: draft.font, disabled: themeLocked, label: __("Font"), onSelect: set("font") }
		);
		const cfg = this.layout && this.layout.active ? this.layout.config : null;
		this.$body.find("[data-layout-section]").prop("hidden", !cfg);
		if (!cfg) return;
		const lr = this.ns.layoutResolve;
		for (const key of lr.LAYOUT_KEYS) {
			const category = cfg.categories[key];
			const locked = !this.xp.layout_open[category.group];
			ui.renderOptions(
				this.control(key),
				category.options.map((o) => ({
					value: o.value,
					label: __(o.value),
					description: __(o.description),
					badges: o.value === pack.defaults[key] ? [{ label: __("Experience Default") }] : [],
				})),
				{ selected: draft[key], disabled: locked, label: __(category.label), onSelect: set(key) }
			);
			this.$body.find(`[data-locked="${key}"]`).prop("hidden", !locked);
		}
	}

	async act(action) {
		const key = this.inspected;
		if (action === "preview") {
			this.session.setExperience(key);
			this.render();
			frappe.show_alert({
				message: __("Previewing {0}. Open any page to try it; nothing is saved yet.", [__(this.pack(key).title)]),
				indicator: "blue",
			});
		} else if (action === "apply") {
			if (this.session.draft.experience !== key) this.session.setExperience(key);
			await this.save();
		} else if (action === "site") {
			this.publish(key);
		} else if (action === "restore") {
			this.restore(key);
		}
	}

	async save() {
		if (!this.ready) return;
		const wanted = this.session.draft && this.session.draft.experience;
		let saved;
		try {
			saved = await this.session.save();
		} catch (e) {
			// The server explained why (frappe.xcall shows its message); the
			// draft stays so nothing the user picked is lost.
			this.render();
			return;
		}
		this.inspected = this.xp.key;
		this.render();
		if (!Object.keys(saved).length) {
			frappe.show_alert({ message: __("Nothing to save"), indicator: "blue" });
			return;
		}
		const problem = this.activationProblem(wanted);
		if (problem) {
			frappe.msgprint({ title: __("Experience Not Applied"), message: problem, indicator: "red" });
			return;
		}
		frappe.show_alert({ message: __("{0} is now your experience", [__(this.pack(this.xp.key).title)]), indicator: "green" });
	}

	/**
	 * What the user would not see after saving `key`, or null when the Desk
	 * really changed: the server's saved experience, the experience engine's
	 * attributes and the home route all have to agree.
	 */
	activationProblem(key) {
		const pack = this.pack(key);
		if (!pack) return null;
		const html = document.documentElement;
		if (this.xp.key !== key)
			return __("The server kept {0}. Your administrator may not offer {1}.", [__(this.pack(this.xp.key).title), __(pack.title)]);
		if (!this.experience.active || html.getAttribute("data-ui-x") !== key || html.getAttribute("data-ui-shell-home") !== pack.shell.home)
			return __("{0} was saved but could not be switched on in this window. Reload the page.", [__(pack.title)]);
		if (pack.custom_home && frappe.boot.home_page !== "ui-home")
			return __("{0} was saved, but this site cannot show its home page yet. An administrator needs to run bench migrate for this site.", [__(pack.title)]);
		return null;
	}

	restore(key) {
		const pack = this.pack(key || this.session.draft.experience) || this.pack(this.xp.key);
		frappe.confirm(__("Remove your adjustments to {0} and use its own settings?", [__(pack.title)]), async () => {
			await this.session.restore(pack.key);
			frappe.show_alert({ message: __("{0} defaults restored", [__(pack.title)]), indicator: "green" });
			this.render();
		});
	}

	reset() {
		frappe.confirm(
			__("Forget your experience, your adjustments and your appearance choice, and use the site default?"),
			async () => {
				this.session.cancel();
				await this.ns.preferences.reset();
				this.session.saved = null;
				this.session.begin();
				this.inspected = this.xp.key;
				frappe.show_alert({ message: __("Site default restored"), indicator: "green" });
				this.render();
			}
		);
	}

	publish(key) {
		const pack = this.pack(key || this.inspected);
		frappe.confirm(
			__(
				"Make {0} the site default? Everyone who has not chosen an experience of their own will use it.",
				[__(pack.title)]
			),
			async () => {
				await this.ns.preferences.publishDefaults({ experience: pack.key });
				this.session.saved = null;
				this.session.begin();
				frappe.show_alert({ message: __("Site default updated"), indicator: "green" });
				this.render();
			}
		);
	}
}
