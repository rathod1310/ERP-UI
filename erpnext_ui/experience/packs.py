"""The standard Experience Pack collection.

A pack is a complete, coordinated product direction: which light and dark
theme it uses, one variant for each shell component, its density and font,
and the layout values the Phase 3 layout engine applies. A pack holds no CSS
or JS. CSS keys on the component attributes (html[data-ui-shell-<component>]),
never on a pack name, so a new pack is a new record and needs no new code
unless it asks for a variant that does not exist yet.

The packs are synced into UI Experience records (is_standard = 1) on install
and migrate, the same way theme/presets.py is synced into UI Theme.
"""

# component -> variants. The first variant is the neutral fallback.
COMPONENTS: dict[str, tuple[str, ...]] = {
	"nav": ("structured", "floating", "app-rail", "executive", "department", "icon-rail"),
	"header": ("classic", "command", "search", "management", "department-tabs", "none"),
	"launcher": ("none", "popover", "full"),
	"home": ("workspace", "dashboard", "hub", "overview", "department", "minimal"),
	"form": ("bands", "facts", "standard", "summary", "next-step", "hairline"),
	"list": ("lined", "card-table", "status-tabs", "data-summary", "my-work", "hairline"),
	"report": ("traditional", "analytic", "plain"),
}
COMPONENT_KEYS = tuple(COMPONENTS)

# Home designs drawn by the ui-home Desk Page. "workspace" (Classic) and
# "minimal" draw Frappe's own Home workspace content (its shortcuts and link
# groups, permission-filtered by frappe.desk.desktop.get_desktop_page) in
# their own layouts; the others add their own data. On v16 the native home is
# the Desktop app grid, which every pack would otherwise share.
CUSTOM_HOMES = ("workspace", "dashboard", "hub", "overview", "department", "minimal")
HOME_PAGE = "ui-home"

# Keys a user may adjust on top of a pack (each still needs the site's
# permission: allow_user_selection for theme/density/font, the layout
# group switches for layout keys).
THEME_OVERRIDE_KEYS = ("light_theme", "dark_theme", "density", "font")
LAYOUT_OVERRIDE_KEYS = (
	"navigation",
	"workspace_format",
	"form_format",
	"list_format",
	"content_width",
	"card_style",
	"page_background",
)
OVERRIDE_KEYS = (*THEME_OVERRIDE_KEYS, *LAYOUT_OVERRIDE_KEYS)

DEFAULT_EXPERIENCE = "classic-business"

PACKS: dict[str, dict] = {
	"classic-business": {
		"title": "Classic Business",
		"sort_order": 10,
		"description": "A polished traditional ERP: structured sidebar, classic header, banded workspace cards and familiar forms.",
		"audience": "Teams used to traditional ERP software who want a cleaner, more professional screen without new navigation.",
		"light_theme": "Corporate Blue",
		"dark_theme": "Corporate Blue Dark",
		"compatible_themes": ("Warm Classic", "Slate Professional"),
		"shell": {
			"nav": "structured",
			"header": "classic",
			"launcher": "none",
			"home": "workspace",
			"form": "bands",
			"list": "lined",
			"report": "traditional",
		},
		"density": "Comfortable",
		"font": "Inter",
		"layout": {
			"navigation": "Standard",
			"workspace_format": "Standard",
			"form_format": "Standard",
			"list_format": "Standard",
			"content_width": "Standard",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
		"login": "Split",
		"home_cards": (),
		"home_charts": (),
	},
	"modern-business": {
		"title": "Modern Business",
		"sort_order": 20,
		"description": "A contemporary enterprise SaaS interface: floating navigation, a modular dashboard home and soft cards.",
		"audience": "Organisations that want ERPNext to feel like a current SaaS product.",
		"light_theme": "Modern Office",
		"dark_theme": "Modern Office Dark",
		"compatible_themes": ("Corporate Blue", "Slate Professional"),
		"shell": {
			"nav": "floating",
			"header": "command",
			"launcher": "popover",
			"home": "dashboard",
			"form": "facts",
			"list": "card-table",
			"report": "analytic",
		},
		"density": "Comfortable",
		"font": "Inter",
		"layout": {
			"navigation": "Standard",
			"workspace_format": "Cards",
			"form_format": "Comfortable",
			"list_format": "Comfortable",
			"content_width": "Standard",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
		"login": "Split",
		"home_cards": ("Total Sales Amount", "Sales Orders Count", "Total Purchase Amount", "Total Stock Value"),
		"home_charts": ("Outgoing Bills (Sales Invoice)",),
	},
	"application-hub": {
		"title": "Application Hub",
		"sort_order": 30,
		"description": "A business application platform: search first, then open the app you need from a launcher of tiles.",
		"audience": "Users who move between many modules and think in apps rather than menus.",
		"light_theme": "Slate Professional",
		"dark_theme": "Slate Professional Dark",
		"compatible_themes": ("Corporate Blue", "Modern Office"),
		"shell": {
			"nav": "app-rail",
			"header": "search",
			"launcher": "full",
			"home": "hub",
			"form": "standard",
			"list": "status-tabs",
			"report": "traditional",
		},
		"density": "Comfortable",
		"font": "Inter",
		"layout": {
			"navigation": "Standard",
			"workspace_format": "Cards",
			"form_format": "Standard",
			"list_format": "Standard",
			"content_width": "Standard",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
		"login": "Centered",
		"home_cards": (),
		"home_charts": (),
	},
	"executive-suite": {
		"title": "Executive Suite",
		"sort_order": 40,
		"description": "A premium, restrained management view: key figures, approvals, overdue receivables and activity first.",
		"audience": "Owners, directors and managers who review and approve more than they enter.",
		"light_theme": "Executive Green",
		"dark_theme": "Graphite Dark",
		"compatible_themes": ("Corporate Blue", "Executive Green Dark"),
		"shell": {
			"nav": "executive",
			"header": "management",
			"launcher": "popover",
			"home": "overview",
			"form": "summary",
			"list": "data-summary",
			"report": "analytic",
		},
		"density": "Comfortable",
		"font": "Inter",
		"layout": {
			"navigation": "Standard",
			"workspace_format": "Cards",
			"form_format": "Standard",
			"list_format": "Standard",
			"content_width": "Contained",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
		"login": "Split",
		"home_cards": (
			"Total Outgoing Bills",
			"Total Incoming Bills",
			"Total Incoming Payment",
			"Total Stock Value",
			"Sales Orders Count",
		),
		"home_charts": ("Outgoing Bills (Sales Invoice)", "Incoming Bills (Purchase Invoice)"),
	},
	"department-workspace": {
		"title": "Department Workspace",
		"sort_order": 50,
		"description": "Task-oriented: each department gets a board of assignments, drafts, approvals and work waiting today.",
		"audience": "Operational staff in Sales, Purchase, Accounts, Stock, Manufacturing, Quality, HR, Projects and CRM.",
		"light_theme": "Operations Teal",
		"dark_theme": "Operations Teal Dark",
		"compatible_themes": ("Corporate Blue", "Slate Professional"),
		"shell": {
			"nav": "department",
			"header": "department-tabs",
			"launcher": "none",
			"home": "department",
			"form": "next-step",
			"list": "my-work",
			"report": "traditional",
		},
		"density": "Comfortable",
		"font": "Inter",
		"layout": {
			"navigation": "Standard",
			"workspace_format": "Standard",
			"form_format": "Standard",
			"list_format": "Standard",
			"content_width": "Full Width",
			"card_style": "Bordered",
			"page_background": "Tinted",
		},
		"login": "Split",
		"home_cards": (),
		"home_charts": (),
	},
	"minimal-professional": {
		"title": "Minimal Professional",
		"sort_order": 60,
		"description": "Clean and quiet: an icon rail, hairlines instead of boxes and compact, readable pages.",
		"audience": "Experienced users who want focus and density without losing any function.",
		"light_theme": "Mono Ink",
		"dark_theme": "Mono Ink Dark",
		"compatible_themes": ("Slate Professional", "Graphite Dark"),
		"shell": {
			"nav": "icon-rail",
			"header": "none",
			"launcher": "none",
			"home": "minimal",
			"form": "hairline",
			"list": "hairline",
			"report": "plain",
		},
		"density": "Compact",
		"font": "System UI",
		"layout": {
			"navigation": "Collapsed",
			"workspace_format": "Compact",
			"form_format": "Compact",
			"list_format": "Compact",
			"content_width": "Standard",
			"card_style": "Minimal",
			"page_background": "Plain",
		},
		"login": "Minimal",
		"home_cards": (),
		"home_charts": (),
	},
}
PACK_KEYS = tuple(PACKS)

# Phase 3 milestone 1 layout presets -> the pack users of that preset move to
# (patch v0_5). The presets themselves are retired (decision D3).
LEGACY_LAYOUT_PRESETS = {
	"Classic": "classic-business",
	"Modern": "classic-business",
	"Compact": "minimal-professional",
	"Wide": "department-workspace",
}

# The departments of the Department Workspace home. A department is shown only
# when its DocTypes exist and the user can read at least one of them; roles
# only decide the order. Counts are list queries run with the user's
# permissions; each opens the same list with the same filters.
DEPARTMENTS: tuple[dict, ...] = (
	{
		"key": "sales",
		"label": "Sales",
		"workspace": "Selling",
		"roles": ("Sales Manager", "Sales User"),
		"create": ("Quotation", "Sales Order", "Sales Invoice", "Customer"),
		"doctypes": ("Quotation", "Sales Order", "Sales Invoice"),
		"counts": (
			("Quotations to follow up", "Quotation", {"docstatus": 1, "status": "Open"}),
			("Orders to deliver", "Sales Order", {"docstatus": 1, "status": ["in", ["To Deliver and Bill", "To Deliver"]]}),
			("Orders to bill", "Sales Order", {"docstatus": 1, "status": "To Bill"}),
			("Overdue invoices", "Sales Invoice", {"docstatus": 1, "status": "Overdue"}),
		),
		"reports": ("Sales Register", "Sales Analytics", "Sales Order Analysis", "Customer Acquisition and Loyalty"),
	},
	{
		"key": "purchase",
		"label": "Purchase",
		"workspace": "Buying",
		"roles": ("Purchase Manager", "Purchase User"),
		"create": ("Material Request", "Request for Quotation", "Purchase Order", "Supplier"),
		"doctypes": ("Material Request", "Purchase Order", "Purchase Invoice"),
		"counts": (
			("Material requests pending", "Material Request", {"docstatus": 1, "status": "Pending"}),
			("Orders to receive", "Purchase Order", {"docstatus": 1, "status": ["in", ["To Receive and Bill", "To Receive"]]}),
			("Orders to bill", "Purchase Order", {"docstatus": 1, "status": "To Bill"}),
			("Overdue bills", "Purchase Invoice", {"docstatus": 1, "status": "Overdue"}),
		),
		"reports": ("Purchase Register", "Purchase Analytics", "Purchase Order Analysis", "Supplier-Wise Sales Analytics"),
	},
	{
		"key": "accounts",
		"label": "Accounts",
		"workspace": "Invoicing",
		"roles": ("Accounts Manager", "Accounts User"),
		"create": ("Journal Entry", "Payment Entry", "Sales Invoice", "Purchase Invoice"),
		"doctypes": ("Sales Invoice", "Purchase Invoice", "Journal Entry", "Payment Entry"),
		"counts": (
			("Unpaid sales invoices", "Sales Invoice", {"docstatus": 1, "status": ["in", ["Unpaid", "Overdue", "Partly Paid"]]}),
			("Unpaid purchase invoices", "Purchase Invoice", {"docstatus": 1, "status": ["in", ["Unpaid", "Overdue", "Partly Paid"]]}),
			("Draft journal entries", "Journal Entry", {"docstatus": 0}),
			("Draft payments", "Payment Entry", {"docstatus": 0}),
		),
		"reports": ("General Ledger", "Accounts Receivable", "Accounts Payable", "Trial Balance"),
	},
	{
		"key": "stock",
		"label": "Stock",
		"workspace": "Stock",
		"roles": ("Stock Manager", "Stock User"),
		"create": ("Stock Entry", "Delivery Note", "Purchase Receipt", "Item"),
		"doctypes": ("Stock Entry", "Delivery Note", "Purchase Receipt", "Material Request"),
		"counts": (
			("Draft stock entries", "Stock Entry", {"docstatus": 0}),
			("Draft deliveries", "Delivery Note", {"docstatus": 0}),
			("Draft receipts", "Purchase Receipt", {"docstatus": 0}),
			("Material requests pending", "Material Request", {"docstatus": 1, "status": "Pending"}),
		),
		"reports": ("Stock Balance", "Stock Ledger", "Stock Projected Qty", "Warehouse wise Item Balance Age and Value"),
	},
	{
		"key": "manufacturing",
		"label": "Manufacturing",
		"workspace": "Manufacturing",
		"roles": ("Manufacturing Manager", "Manufacturing User"),
		"create": ("Work Order", "Job Card", "BOM", "Production Plan"),
		"doctypes": ("Work Order", "Job Card", "BOM"),
		"counts": (
			("Work orders not started", "Work Order", {"docstatus": 1, "status": "Not Started"}),
			("Work orders in process", "Work Order", {"docstatus": 1, "status": "In Process"}),
			("Open job cards", "Job Card", {"docstatus": 0}),
			("Draft BOMs", "BOM", {"docstatus": 0}),
		),
		"reports": ("Work Order Summary", "Production Planning Report", "BOM Stock Report", "Job Card Summary"),
	},
	{
		"key": "quality",
		"label": "Quality",
		"workspace": "Quality",
		"roles": ("Quality Manager",),
		"create": ("Quality Inspection", "Non Conformance", "Quality Action"),
		"doctypes": ("Quality Inspection", "Non Conformance", "Quality Action"),
		"counts": (
			("Draft inspections", "Quality Inspection", {"docstatus": 0}),
			("Open non-conformances", "Non Conformance", {"status": "Open"}),
			("Open quality actions", "Quality Action", {"status": "Open"}),
		),
		"reports": ("Quality Inspection Summary",),
	},
	{
		"key": "hr",
		"label": "HR",
		"workspace": "HR Setup",
		"roles": ("HR Manager", "HR User"),
		"create": ("Employee", "Leave Application", "Attendance", "Expense Claim"),
		"doctypes": ("Employee", "Leave Application", "Expense Claim", "Attendance"),
		"counts": (
			("Open leave applications", "Leave Application", {"docstatus": 0, "status": "Open"}),
			("Draft expense claims", "Expense Claim", {"docstatus": 0}),
			("Active employees", "Employee", {"status": "Active"}),
		),
		"reports": ("Employee Leave Balance", "Monthly Attendance Sheet", "Employee Birthday"),
	},
	{
		"key": "projects",
		"label": "Projects",
		"workspace": "Projects",
		"roles": ("Projects Manager", "Projects User"),
		"create": ("Project", "Task", "Timesheet"),
		"doctypes": ("Project", "Task", "Timesheet"),
		"counts": (
			("Open projects", "Project", {"status": "Open"}),
			("Open tasks", "Task", {"status": ["in", ["Open", "Working", "Pending Review"]]}),
			("Overdue tasks", "Task", {"status": "Overdue"}),
			("Draft timesheets", "Timesheet", {"docstatus": 0}),
		),
		"reports": ("Project Summary", "Daily Timesheet Summary", "Delayed Tasks Summary"),
	},
	{
		"key": "crm",
		"label": "CRM",
		"workspace": "CRM",
		"roles": ("Sales Manager", "Sales User"),
		"create": ("Lead", "Opportunity", "Customer", "Contact"),
		"doctypes": ("Lead", "Opportunity", "Customer"),
		"counts": (
			("Open leads", "Lead", {"status": ["in", ["Lead", "Open", "Replied"]]}),
			("Open opportunities", "Opportunity", {"status": "Open"}),
			("Quotations to follow up", "Quotation", {"docstatus": 1, "status": "Open"}),
		),
		"reports": ("Lead Details", "Sales Funnel", "Opportunity Summary by Sales Stage"),
	},
)
DEPARTMENT_KEYS = tuple(d["key"] for d in DEPARTMENTS)

# Transactions whose recent changes feed the "recently updated" lists.
RECENT_DOCTYPES = (
	"Sales Invoice",
	"Sales Order",
	"Quotation",
	"Purchase Order",
	"Purchase Invoice",
	"Stock Entry",
	"Delivery Note",
	"Purchase Receipt",
	"Journal Entry",
	"Payment Entry",
	"Material Request",
	"Customer",
	"Supplier",
	"Item",
)

# Quick actions offered on the Dashboard and Hub homes (only those the user may create).
QUICK_CREATE = ("Sales Invoice", "Sales Order", "Quotation", "Purchase Order", "Stock Entry", "Customer", "Item")
