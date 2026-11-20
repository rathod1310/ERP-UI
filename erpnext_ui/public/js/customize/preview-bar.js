// A small bar at the bottom of the page while unsaved appearance or layout
// changes are being previewed, on any Desk route: Save, Cancel, or go back
// to Appearance & Theme. One element, created on first use; one listener for
// session changes.

import { SESSION_EVENT } from "./session.js";

const PAGE_ROUTE = "ui-preferences";

export class PreviewBar {
	constructor({ doc, session, translate, setRoute, alert }) {
		this.doc = doc;
		this.session = session;
		this.__ = translate || ((s) => s);
		this.setRoute = setRoute;
		this.alert = alert;
		this.el = null;
		this.installed = false;
		this._onChange = (event) => this.render(event.detail);
	}

	install() {
		if (this.installed || typeof this.doc.addEventListener !== "function") return false;
		this.installed = true;
		this.doc.addEventListener(SESSION_EVENT, this._onChange);
		return true;
	}

	uninstall() {
		this.doc.removeEventListener(SESSION_EVENT, this._onChange);
		if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
		this.el = null;
		this.installed = false;
	}

	_element() {
		if (this.el) return this.el;
		const el = this.doc.createElement("div");
		el.className = "eui-preview-bar";
		el.setAttribute("role", "status");
		el.hidden = true;
		el.innerHTML = `
			<span class="eui-preview-bar-text"></span>
			<span class="eui-preview-bar-actions">
				<button type="button" class="btn btn-default btn-xs" data-action="customize"></button>
				<button type="button" class="btn btn-default btn-xs" data-action="cancel"></button>
				<button type="button" class="btn btn-primary btn-xs" data-action="save"></button>
			</span>`;
		el.querySelector('[data-action="customize"]').textContent = this.__("Customize");
		el.querySelector('[data-action="cancel"]').textContent = this.__("Cancel Preview");
		el.querySelector('[data-action="save"]').textContent = this.__("Apply to Me");
		el.addEventListener("click", (event) => {
			const button = event.target.closest("button[data-action]");
			if (button) this.act(button.getAttribute("data-action"));
		});
		this.doc.body.appendChild(el);
		this.el = el;
		return el;
	}

	render(detail = {}) {
		if (!detail.dirty && !this.el) return;
		const el = this._element();
		el.hidden = !detail.dirty;
		const count = (detail.changed || []).length;
		const pack = this.session.experience && this.session.experience.shown && this.session.experience.shown();
		const switching = (detail.changed || []).includes("experience");
		el.querySelector(".eui-preview-bar-text").textContent = switching && pack
			? this.__("Previewing {0}. Open any page to try it; nothing is saved yet.", [pack.title])
			: this.__(
					"Previewing {0} unsaved change(s). Open any page to try them; nothing is stored yet.",
					[count]
			  );
		const onPage = this.doc.body.getAttribute("data-route") === `${PAGE_ROUTE}`;
		el.querySelector('[data-action="customize"]').hidden = onPage;
	}

	async act(action) {
		if (action === "cancel") this.session.cancel();
		else if (action === "customize" && this.setRoute) this.setRoute(PAGE_ROUTE);
		else if (action === "save") {
			try {
				await this.session.save();
			} catch (e) {
				return; // the server's message is shown by frappe.xcall; the preview stays
			}
			if (this.alert) this.alert(this.__("Your experience was saved"));
		}
	}
}
