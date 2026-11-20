// Starts the theme engine, then the layout engine, exactly once per page.
//
// The bundle runs synchronously after Frappe's desk bundle and after the inline
// `frappe.boot = {...}` script, but before Desk renders on document ready. The
// theme is therefore in place before the first Desk paint (only the splash
// screen, styled by Frappe from User.desk_theme, precedes it).

import { createLogger } from "./logger.js";
import { ThemeEngine, EVENTS } from "../theme/engine.js";
import { selectAdapter } from "../adapters/index.js";
import { PreferencesClient } from "../preferences/client.js";
import {
	renderGallery,
	renderSegmented,
	renderOptions,
	renderLayoutPresets,
	layoutSampleHtml,
	escapeHtml,
} from "../configuration/gallery.js";
import * as resolve from "../theme/resolve.js";
import * as layoutResolve from "../layout/resolve.js";
import { LayoutEngine, LAYOUT_EVENTS } from "../layout/engine.js";
import { CustomizationSession, SESSION_EVENT } from "../customize/session.js";
import { ExperienceEngine, EXPERIENCE_EVENTS } from "../experience/engine.js";
import * as experienceResolve from "../experience/resolve.js";
import { sketchHtml, scaleSketches } from "../configuration/sketch.js";
import { PreviewBar } from "../customize/preview-bar.js";

export function bootstrap(win) {
	const ns = (win.erpnext_ui = win.erpnext_ui || {});
	if (ns.engine) {
		ns.engine.logger.debug("bundle loaded twice; keeping the first engine");
		return ns.engine;
	}

	const logger = createLogger();
	const doc = win.document;
	const engine = new ThemeEngine({
		root: doc.documentElement,
		doc,
		matchMedia: typeof win.matchMedia === "function" ? win.matchMedia.bind(win) : null,
		MutationObserver: win.MutationObserver,
		CustomEvent: win.CustomEvent,
		logger,
	});

	const layout = new LayoutEngine({
		root: doc.documentElement,
		doc,
		CustomEvent: win.CustomEvent,
		logger,
	});

	const experience = new ExperienceEngine({
		root: doc.documentElement,
		doc,
		CustomEvent: win.CustomEvent,
		logger,
		boot: win.frappe && win.frappe.boot,
		goHome: () => {
			const f = win.frappe;
			f.route_flags = f.route_flags || {};
			f.route_flags.replace_route = true; // replace, so Back does not return to the launcher
			f.set_route("");
		},
	});

	Object.assign(ns, {
		engine,
		layout,
		experience,
		events: { ...EVENTS, ...LAYOUT_EVENTS, ...EXPERIENCE_EVENTS, customize: SESSION_EVENT },
		resolve,
		layoutResolve,
		experienceResolve,
		ui: {
			renderGallery,
			renderSegmented,
			renderOptions,
			renderLayoutPresets,
			layoutSampleHtml,
			escapeHtml,
			sketchHtml,
			scaleSketches,
		},
	});

	try {
		const frappe = win.frappe;
		const raw = frappe && frappe.boot ? frappe.boot.erpnext_ui : null;
		const config = resolve.normaliseConfig(raw);
		ns.version = (raw && raw.app_version) || null;
		const env = { frappe, win };
		const adapter = config.enabled ? selectAdapter(config, env) : null;
		engine.init(config, adapter);
		if (adapter && engine.active) {
			adapter.install(engine, env);
			startLayout(layout, raw, adapter, logger);
			startExperience(experience, raw, logger, adapter);
		}
		// Layout and experience need the theme engine's adapter attribute; they follow it.
		if (typeof doc.addEventListener === "function")
			doc.addEventListener(EVENTS.deactivated, () => {
				layout.deactivate();
				experience.deactivate();
			});
		if (frappe && typeof frappe.xcall === "function") {
			ns.preferences = new PreferencesClient(engine, frappe, layout, experience);
			engine.onAppearanceChange = (appearance) =>
				ns.preferences.recordAppearance(appearance);
			ns.customize = new CustomizationSession({
				themeEngine: engine,
				layoutEngine: layout,
				experienceEngine: experience,
				preferences: ns.preferences,
				doc,
				CustomEvent: win.CustomEvent,
			});
			ns.previewBar = new PreviewBar({
				doc,
				session: ns.customize,
				translate: win.__,
				setRoute: (route) => frappe.set_route(route),
				alert: (message) =>
					frappe.show_alert && frappe.show_alert({ message, indicator: "green" }),
			});
			ns.previewBar.install();
		}
		logger.debug(
			"engine",
			engine.active ? "active" : "inactive",
			engine.reason || engine.current
		);
	} catch (error) {
		// Never let a theme problem stop Desk from loading.
		logger.error("initialisation failed; native Desk styling kept", error);
		try {
			engine.deactivate("error");
			layout.deactivate();
			experience.deactivate();
		} catch (e) {
			/* nothing more to do */
		}
	}
	return engine;
}

function startLayout(layout, raw, adapter, logger) {
	try {
		layout.init(raw && raw.layout, adapter);
		logger.debug("layout", layout.active ? layout.current.preset : "inactive");
	} catch (error) {
		// A layout problem keeps the themed Phase 1 Desk.
		logger.error("layout initialisation failed", error);
		layout.deactivate();
	}
}

function startExperience(experience, raw, logger, adapter) {
	try {
		experience.init(raw && raw.experience);
		if (adapter && typeof adapter.addRouteListener === "function")
			adapter.addRouteListener((route) => experience.onRouteChange(route));
		logger.debug("experience", experience.active ? experience.current.key : "inactive");
	} catch (error) {
		// An experience problem keeps the themed Desk with its layout.
		logger.error("experience initialisation failed", error);
		experience.deactivate();
	}
}
