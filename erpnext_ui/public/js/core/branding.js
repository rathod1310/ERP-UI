// White-label branding (see core/branding.py). Every string Desk shows
// through __() has the stock product name replaced by the brand name, and
// the browser tab title follows. Runs whether or not the theme engine is
// active, so the brand never depends on a supported adapter.

export function brandText(text, brand) {
	if (typeof text !== "string" || !brand || !brand.pattern) return text;
	return text.replace(brand.pattern, brand.name);
}

export function makeBrand(raw) {
	if (!raw || typeof raw.name !== "string" || !raw.name) return null;
	const words = (Array.isArray(raw.replace) ? raw.replace : ["ERPNext"]).filter(
		(w) => typeof w === "string" && /^[\w .-]+$/.test(w)
	);
	if (!words.length) return null;
	const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	return {
		name: raw.name,
		logo: raw.logo || null,
		mark: raw.mark || null,
		favicon: raw.favicon || null,
		pattern: new RegExp(`\\b(?:${escaped.join("|")})\\b`, "g"),
	};
}

export function installBranding(win) {
	const f = win.frappe;
	const raw = f && f.boot && f.boot.erpnext_ui && f.boot.erpnext_ui.brand;
	const brand = makeBrand(raw);
	if (!brand || !f || typeof f._ !== "function" || f._.__erpnextUiBrand) return null;

	const original = f._;
	const branded = function (txt, replace, context) {
		return brandText(original.call(this, txt, replace, context), brand);
	};
	branded.__erpnextUiBrand = true;
	f._ = branded;
	win.__ = branded;

	const doc = win.document;
	const fixTitle = () => {
		const next = brandText(doc.title, brand);
		if (next !== doc.title) doc.title = next;
	};
	fixTitle();
	const titleNode = doc.querySelector("title");
	if (titleNode && win.MutationObserver) {
		new win.MutationObserver(fixTitle).observe(titleNode, { childList: true, characterData: true, subtree: true });
	}
	if (brand.favicon) {
		for (const link of doc.querySelectorAll('link[rel~="icon"]')) {
			if (/\/assets\/(frappe|erpnext)\//.test(link.getAttribute("href") || ""))
				link.setAttribute("href", brand.favicon);
		}
	}
	brandAboutDialog(win, brand);
	doc.documentElement.setAttribute("data-ui-brand", "skydoterp");
	return brand;
}

/** Strip the internal app name from an About version line: "erpnext: 16.5" -> "16.5". */
export function versionLine(text) {
	return typeof text === "string" ? text.replace(/^\s*[a-z0-9_]+:\s*/i, "") : text;
}

/**
 * Frappe's About dialog (frappe.ui.misc.about) names Frappe in its header,
 * links and footer. The dialog is built once and reused; after Frappe builds
 * it, those parts are replaced with the brand. The app list comes branded
 * from the server (erpnext_ui.api.branding.get_versions).
 */
function brandAboutDialog(win, brand) {
	const f = win.frappe;
	const misc = f && f.ui && f.ui.misc;
	if (!misc || typeof misc.about !== "function" || misc.about.__erpnextUiBrand) return;
	const original = misc.about;
	const branded = function () {
		const result = original.apply(this, arguments);
		try {
			applyAboutBrand(win, misc.about_dialog, brand);
		} catch (e) {
			/* the native dialog stays usable */
		}
		return result;
	};
	branded.__erpnextUiBrand = true;
	misc.about = branded;
}

const node = (x) => (x && x.jquery ? x[0] : x) || null;

function applyAboutBrand(win, dialog, brand) {
	const body = node(dialog && dialog.body);
	if (!body || body.__erpnextUiBrand) return;
	body.__erpnextUiBrand = true;
	const t = (text) => (typeof win.__ === "function" ? win.__(text) : text);
	const mark = body.querySelector(".about-frappe-wordmark");
	if (mark && brand.logo) {
		mark.setAttribute("src", brand.logo);
		mark.setAttribute("alt", brand.name);
		mark.style.maxHeight = "64px";
		mark.style.width = "auto";
	}
	const tagline = body.querySelector(".about-tagline");
	if (tagline) tagline.textContent = t("Complete business management suite.");
	const social = body.querySelector(".about-social-btns");
	if (social) social.remove();
	const versionTitle = body.querySelector(".about-info-row .about-info-title");
	if (versionTitle) versionTitle.textContent = t("Platform Version");
	const footerWrap = node(dialog.footer);
	const footer = footerWrap && footerWrap.querySelector(".about-footer");
	if (footer) footer.textContent = `© ${new Date().getFullYear()} ${brand.name}`;
	// Older markup (v16): any Frappe logo, link or copyright line.
	for (const root of [body, footerWrap].filter(Boolean)) {
		root.querySelectorAll('img[src*="/assets/frappe/images/"]').forEach((img) => brand.logo && img.setAttribute("src", brand.logo));
		root.querySelectorAll('a[href*="frappe.io"], a[href*="github.com/frappe"], a[href*="frappeframework.com"]').forEach((a) => a.remove());
		root.querySelectorAll("*").forEach((el) => {
			if (el.children.length === 0 && /Frappe Technologies/.test(el.textContent || ""))
				el.textContent = `© ${new Date().getFullYear()} ${brand.name}`;
		});
	}

	const clean = () => {
		body.querySelectorAll("#about-framework-version, .about-app-version").forEach((el) => {
			const next = versionLine(el.textContent);
			if (next !== el.textContent) el.textContent = next;
		});
		body.querySelectorAll(".about-app-row[title]").forEach((row) => row.setAttribute("title", versionLine(row.getAttribute("title"))));
	};
	clean();
	if (win.MutationObserver) new win.MutationObserver(clean).observe(body, { childList: true, subtree: true, characterData: true });
}
