import { bootstrap } from "./core/bootstrap.js";
import { installBranding } from "./core/branding.js";

try {
	installBranding(window);
} catch (e) {
	console.error("erpnext_ui: branding not installed", e);
}
bootstrap(window);
