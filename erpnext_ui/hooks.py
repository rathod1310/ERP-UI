app_name = "erpnext_ui"
app_title = "ERPNext UI"
app_publisher = "Skydot Infotech"
app_description = "Professional design system, theme engine and UI experience layer for Frappe/ERPNext Desk"
app_email = "skydotinfotech@gmail.com"
app_license = "mit"

# Desk assets. The CSS only takes effect once the theme engine has marked
# <html> with data-ui-adapter, so a failed or disabled engine leaves the
# native Desk untouched.
app_include_css = ["erpnext_ui.bundle.css"]
app_include_js = ["erpnext_ui.bundle.js"]

# The effective configuration is embedded in the page, so the first paint
# needs no extra request.
extend_bootinfo = "erpnext_ui.boot.extend_bootinfo"

after_install = "erpnext_ui.install.after_install"
after_migrate = "erpnext_ui.install.after_migrate"
after_uninstall = "erpnext_ui.install.after_uninstall"
