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
	doc.documentElement.setAttribute("data-ui-brand", "skydoterp");
	return brand;
}
