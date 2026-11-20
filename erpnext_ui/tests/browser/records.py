"""Disposable business records for the Phase 2 browser and regression run.

Every record is clearly marked: names start with "EUI Test" / "EUI-TEST", and
transactions carry REMARK. teardown() cancels and deletes only records that
carry these markers. Run through `bench execute` (which commits); refuses to
run on sites without `allow_tests`.
"""

import frappe
from frappe.utils import add_days, nowdate

REMARK = "erpnext_ui browser test record (safe to delete)"
CUSTOMERS = ("EUI Test Customer A", "EUI Test Customer B")
SUPPLIER = "EUI Test Supplier"
STOCK_ITEM = "EUI-TEST-WIDGET"
SERVICE_ITEM = "EUI-TEST-SERVICE"


def _guard():
	if not frappe.conf.allow_tests:
		frappe.throw("Test records can only be created on a site with allow_tests enabled")


def _company():
	return (
		frappe.db.get_single_value("Global Defaults", "default_company")
		or frappe.get_all("Company", pluck="name", limit=1)[0]
	)


def _warehouse(company):
	abbr = frappe.db.get_value("Company", company, "abbr")
	return f"Stores - {abbr}"


def _insert(doc):
	return frappe.get_doc(doc).insert(ignore_permissions=True)


def setup():
	_guard()
	teardown()
	company = _company()
	warehouse = _warehouse(company)

	for name in CUSTOMERS:
		_insert(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_group": "Commercial",
				"territory": "India",
			}
		)
	_insert({"doctype": "Supplier", "supplier_name": SUPPLIER, "supplier_group": "Local"})
	for code, is_stock, rate in ((STOCK_ITEM, 1, 250), (SERVICE_ITEM, 0, 1200)):
		_insert(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": code.replace("-", " ").title(),
				"item_group": "Products" if is_stock else "Services",
				"stock_uom": "Nos",
				"is_stock_item": is_stock,
				"standard_rate": rate,
				"valuation_rate": rate if is_stock else 0,
			}
		)

	receipt = _insert(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": company,
			"remarks": REMARK,
			"items": [
				{
					"item_code": STOCK_ITEM,
					"qty": 100,
					"basic_rate": 180,
					"t_warehouse": warehouse,
				}
			],
		}
	)
	receipt.submit()

	# A spread of invoices for list, filter and report checks.
	for i in range(8):
		si = _insert(
			{
				"doctype": "Sales Invoice",
				"company": company,
				"customer": CUSTOMERS[i % 2],
				"posting_date": add_days(nowdate(), -i * 3),
				"set_posting_time": 1,
				"due_date": add_days(nowdate(), 30),
				"remarks": REMARK,
				"items": [
					{"item_code": SERVICE_ITEM, "qty": 1 + i, "rate": 1200},
					{"item_code": STOCK_ITEM, "qty": 2, "rate": 250},
				],
			}
		)
		if i < 6:
			si.submit()

	_insert(
		{
			"doctype": "Purchase Order",
			"company": company,
			"supplier": SUPPLIER,
			"transaction_date": nowdate(),
			"schedule_date": add_days(nowdate(), 7),
			"items": [
				{
					"item_code": STOCK_ITEM,
					"qty": 20,
					"rate": 175,
					"warehouse": warehouse,
					"schedule_date": add_days(nowdate(), 7),
				}
			],
		}
	)
	frappe.db.commit()
	return summary()


def summary():
	return {
		"sales_invoices": frappe.db.count("Sales Invoice", {"customer": ["in", CUSTOMERS]}),
		"purchase_orders": frappe.db.count("Purchase Order", {"supplier": SUPPLIER}),
		"stock_entries": frappe.db.count("Stock Entry", {"remarks": REMARK}),
	}


def _remove(doctype, filters):
	for name in frappe.get_all(doctype, filters=filters, pluck="name", order_by="creation desc"):
		doc = frappe.get_doc(doctype, name)
		if doc.docstatus == 1:
			doc.flags.ignore_permissions = True
			doc.cancel()
		frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)


def teardown():
	"""Remove the marked records, including documents the browser run created for them."""
	_guard()
	_remove("Sales Invoice", {"customer": ["in", CUSTOMERS]})
	_remove("Purchase Order", {"supplier": SUPPLIER})
	_remove("Stock Entry", {"remarks": REMARK})
	_remove("Stock Entry", {"name": ["in", _entries_for_item(STOCK_ITEM)]})
	for code in (STOCK_ITEM, SERVICE_ITEM):
		if frappe.db.exists("Item", code):
			frappe.delete_doc("Item", code, ignore_permissions=True, force=True)
	for name in (*CUSTOMERS, SUPPLIER):
		for doctype in ("Customer", "Supplier"):
			if frappe.db.exists(doctype, name):
				frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
	frappe.db.commit()


def _entries_for_item(item_code):
	return frappe.get_all(
		"Stock Entry Detail", filters={"item_code": item_code}, pluck="parent", distinct=True
	)
