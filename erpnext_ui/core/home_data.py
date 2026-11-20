"""Data for the experience home pages (ui-home).

Every figure and list here comes from Frappe's own permission-checked paths:
`frappe.get_list` (role permissions, user permissions on Company, Territory
and so on, and permission query conditions such as those of ToDo, Workflow
Action and Notification Log), `frappe.has_permission`, and the Number Card /
Dashboard Chart permission hooks. Nothing is fabricated: a source the user
cannot read is left out, never shown as zero.

Results are cached per user for CACHE_SECONDS, never shared between users.
"""

import frappe
from frappe import _
from frappe.utils import cint, getdate, nowdate

from erpnext_ui.experience.packs import DEPARTMENTS, QUICK_CREATE, RECENT_DOCTYPES

CACHE_SECONDS = 60
DESIGNS = ("workspace", "dashboard", "hub", "overview", "department", "minimal")


def _cache_key(design: str, department: str | None) -> str:
	return f"erpnext_ui:home:{frappe.session.user}:{design}:{department or ''}"


def _exists(doctype: str) -> bool:
	try:
		return bool(frappe.db.exists("DocType", doctype))
	except Exception:
		return False


def _can(doctype: str, ptype: str = "read") -> bool:
	return _exists(doctype) and bool(frappe.has_permission(doctype, ptype))


def _safe(fn, default):
	"""One failing source (a missing DocType or field on this site) must not
	take the whole home page down."""
	try:
		return fn()
	except frappe.PermissionError:
		frappe.clear_last_message()
		return default
	except Exception:
		frappe.clear_last_message()
		frappe.logger("erpnext_ui").exception("home data source failed")
		return default


def creatable(doctypes) -> list[dict]:
	return [{"doctype": dt, "label": _(dt)} for dt in doctypes if _can(dt, "create")]


def count(doctype: str, filters: dict) -> int | None:
	if not _can(doctype):
		return None
	meta = frappe.get_meta(doctype)
	for field in filters:
		if field not in ("docstatus", "name") and not meta.has_field(field):
			return None
	rows = frappe.get_list(doctype, filters=filters, fields=[{"COUNT": "*", "as": "count"}], order_by=None)
	return cint(rows[0]["count"]) if rows else 0


def recent_documents(limit: int = 8) -> list[dict]:
	"""Documents the user changed most recently, across the common transactions."""
	user = frappe.session.user
	out = []
	for doctype in RECENT_DOCTYPES:
		if not _can(doctype):
			continue
		meta = frappe.get_meta(doctype)
		fields = ["name", "modified", "docstatus"]
		title = meta.get_title_field()
		if title and title != "name" and meta.has_field(title):
			fields.append(f"{title} as title")
		if meta.has_field("status"):
			fields.append("status")
		rows = _safe(
			lambda dt=doctype, f=fields: frappe.get_list(
				dt, filters={"modified_by": user}, fields=f, order_by="modified desc", limit_page_length=3
			),
			[],
		)
		for row in rows:
			out.append(
				{
					"doctype": doctype,
					"name": row.name,
					"title": row.get("title") or row.name,
					"status": row.get("status") or ("Draft" if row.docstatus == 0 else "Submitted" if row.docstatus == 1 else "Cancelled"),
					"modified": str(row.modified),
				}
			)
	out.sort(key=lambda r: r["modified"], reverse=True)
	return out[:limit]


def assigned_to_me(limit: int = 6, doctypes=None) -> list[dict]:
	if not _can("ToDo"):
		return []
	filters = {"allocated_to": frappe.session.user, "status": "Open"}
	if doctypes:
		filters["reference_type"] = ["in", list(doctypes)]
	rows = frappe.get_list(
		"ToDo",
		filters=filters,
		fields=["name", "description", "reference_type", "reference_name", "date", "priority"],
		order_by="date asc, modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"name": r.name,
			"description": frappe.utils.strip_html(r.description or "")[:140],
			"reference_type": r.reference_type,
			"reference_name": r.reference_name,
			"date": str(r.date) if r.date else None,
			"priority": r.priority,
		}
		for r in rows
	]


def awaiting_approval(limit: int = 6, doctypes=None) -> list[dict]:
	"""Open Workflow Actions; Frappe's permission query limits them to the user's roles."""
	if not _can("Workflow Action"):
		return []
	filters = {"status": "Open"}
	if doctypes:
		filters["reference_doctype"] = ["in", list(doctypes)]
	rows = frappe.get_list(
		"Workflow Action",
		filters=filters,
		fields=["name", "reference_doctype", "reference_name", "workflow_state", "creation"],
		order_by="creation desc",
		limit_page_length=limit,
	)
	return [
		{
			"doctype": r.reference_doctype,
			"name": r.reference_name,
			"state": r.workflow_state,
			"since": str(r.creation),
		}
		for r in rows
		if r.reference_doctype and _can(r.reference_doctype)
	]


def my_drafts(doctypes, limit: int = 6) -> list[dict]:
	user = frappe.session.user
	out = []
	for doctype in doctypes:
		if not _can(doctype) or not frappe.get_meta(doctype).is_submittable:
			continue
		rows = frappe.get_list(
			doctype,
			filters={"docstatus": 0, "owner": user},
			fields=["name", "modified"],
			order_by="modified desc",
			limit_page_length=limit,
		)
		out += [{"doctype": doctype, "name": r.name, "modified": str(r.modified)} for r in rows]
	out.sort(key=lambda r: r["modified"], reverse=True)
	return out[:limit]


def overdue_receivables(limit: int = 5) -> list[dict]:
	if not _can("Sales Invoice"):
		return []
	rows = frappe.get_list(
		"Sales Invoice",
		filters={"docstatus": 1, "status": "Overdue"},
		fields=["name", "customer", "customer_name", "outstanding_amount", "currency", "due_date"],
		order_by="due_date asc",
		limit_page_length=limit,
	)
	today = getdate(nowdate())
	return [
		{
			"name": r.name,
			"customer": r.customer_name or r.customer,
			"outstanding": r.outstanding_amount,
			"currency": r.currency,
			"days": (today - getdate(r.due_date)).days if r.due_date else None,
		}
		for r in rows
	]


def activity(limit: int = 6) -> list[dict]:
	if not _can("Notification Log"):
		return []
	rows = frappe.get_list(
		"Notification Log",
		filters={"for_user": frappe.session.user},
		fields=["name", "subject", "document_type", "document_name", "creation", "read"],
		order_by="creation desc",
		limit_page_length=limit,
	)
	return [
		{
			"subject": frappe.utils.strip_html(r.subject or "")[:160],
			"doctype": r.document_type,
			"name": r.document_name,
			"when": str(r.creation),
			"read": cint(r.read),
		}
		for r in rows
	]


def _report_allowed(name: str) -> bool:
	if not frappe.db.exists("Report", name):
		return False
	try:
		return bool(frappe.get_cached_doc("Report", name).is_permitted())
	except Exception:
		return False


def departments() -> list[dict]:
	"""Departments this user can work in, the ones matching their roles first."""
	roles = set(frappe.get_roles())
	out = []
	for i, d in enumerate(DEPARTMENTS):
		if not any(_can(dt) for dt in d["doctypes"]):
			continue
		matched = bool(roles & set(d["roles"]))
		out.append({"key": d["key"], "label": _(d["label"]), "workspace": d["workspace"], "role_match": int(matched), "_order": (0 if matched else 1, i)})
	out.sort(key=lambda d: d.pop("_order"))
	return out


def department_board(key: str | None) -> dict:
	available = departments()
	keys = [d["key"] for d in available]
	if key not in keys:
		key = keys[0] if keys else None
	if not key:
		return {"departments": [], "department": None}
	d = next(x for x in DEPARTMENTS if x["key"] == key)
	counts = []
	for label, doctype, filters in d["counts"]:
		value = _safe(lambda dt=doctype, f=filters: count(dt, f), None)
		if value is not None:
			counts.append({"label": _(label), "doctype": doctype, "filters": filters, "count": value})
	return {
		"departments": available,
		"department": {
			"key": key,
			"label": _(d["label"]),
			"workspace": d["workspace"] if frappe.db.exists("Workspace", d["workspace"]) else None,
			"counts": counts,
			"create": creatable(d["create"]),
			"assigned": _safe(lambda: assigned_to_me(6), []),
			"drafts": _safe(lambda: my_drafts(d["doctypes"]), []),
			"approvals": _safe(lambda: awaiting_approval(6, d["doctypes"]), []),
			"reports": [r for r in d["reports"] if _report_allowed(r)],
		},
	}


def build(design: str, department: str | None = None) -> dict:
	user = frappe.get_cached_doc("User", frappe.session.user)
	data = {
		"design": design,
		"user": {"first_name": user.first_name or user.full_name or user.name, "full_name": user.full_name},
		"company": frappe.defaults.get_user_default("Company"),
		"today": nowdate(),
	}
	if design in ("dashboard", "hub", "workspace", "minimal"):
		data["create"] = creatable(QUICK_CREATE)
		data["recent"] = _safe(recent_documents, [])
	if design == "overview":
		data["approvals"] = _safe(awaiting_approval, [])
		data["overdue"] = _safe(overdue_receivables, [])
		data["activity"] = _safe(activity, [])
	if design == "department":
		data.update(department_board(department))
	if design == "dashboard":
		data["assigned"] = _safe(assigned_to_me, [])
	return data


def get(design: str, department: str | None = None, refresh: bool = False) -> dict:
	key = _cache_key(design, department)
	if not refresh:
		cached = frappe.cache.get_value(key)
		if cached:
			return cached
	data = build(design, department)
	frappe.cache.set_value(key, data, expires_in_sec=CACHE_SECONDS)
	return data


CARD_FIELDS = (
	"name",
	"label",
	"type",
	"document_type",
	"parent_document_type",
	"function",
	"aggregate_function_based_on",
	"filters_json",
	"dynamic_filters_json",
	"show_percentage_stats",
	"stats_time_interval",
	"currency",
	"show_full_number",
)


def cards(names) -> list[dict]:
	"""The Number Cards (of the given names, in that order) this user may read.

	Only Document Type cards: their value is a frappe.get_list aggregate, so
	it is computed with the user's permissions. The browser evaluates the
	cards' dynamic filters and fetches the values exactly as Frappe's own
	workspace widget does.
	"""
	out = []
	for name in names or []:
		if not isinstance(name, str) or not frappe.db.exists("Number Card", name):
			continue
		doc = frappe.get_cached_doc("Number Card", name)
		if doc.type != "Document Type" or not _can(doc.document_type):
			continue
		if not frappe.has_permission("Number Card", "read", doc=doc):
			continue
		out.append({f: doc.get(f) for f in CARD_FIELDS})
	return out


def chart(chart_name: str) -> dict | None:
	"""A Dashboard Chart's data, only when the user may read the chart and its
	DocType. Frappe's own `dashboard_chart.get` does not check the chart's
	permission itself (the workspace checks it first), so this does."""
	if not frappe.db.exists("Dashboard Chart", chart_name):
		return None
	doc = frappe.get_doc("Dashboard Chart", chart_name)
	if not frappe.has_permission("Dashboard Chart", "read", doc=doc):
		return None
	if doc.chart_type == "Report" or doc.type == "Heatmap":
		return None  # report charts run a report; not used on home pages (M3)
	if doc.document_type and not _can(doc.document_type):
		return None
	if doc.dynamic_filters_json and doc.dynamic_filters_json not in ("[]", "{}", "null"):
		return None  # browser-side expressions; Frappe evaluates them in the workspace widget
	from frappe.desk.doctype.dashboard_chart.dashboard_chart import get as get_chart

	config = get_chart(chart_name=chart_name)
	return {
		"name": doc.name,
		"label": _(doc.chart_name),
		"type": (doc.type or "Line").lower(),
		"color": doc.color,
		"timespan": doc.timespan,
		"interval": doc.time_interval,
		"currency": doc.currency or frappe.defaults.get_global_default("currency"),
		"data": config,
	}
